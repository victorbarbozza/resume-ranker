import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { fixedAnswerModel } from '@/server/shared/connectors/llm'
import { fileStorage } from '@/server/shared/connectors/storage'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as resumeFilesRepo from '@/server/shared/database/repositories/resume-files'
import { RESUME_TEXT_MAX_CHARS } from '@/server/shared/schemas/candidate.schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  blankPdf,
  longDocx,
  sampleDocx,
  samplePdf,
  sampleResumeText,
} from '@/server/test/files'
import { uploadResume } from '@/server/test/fixtures'

import { extractProfile } from './extract-profile'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const answer = {
  name: 'Ana Souza',
  areas: ['engineering'],
  profile: {
    skills: ['Node.js', 'PostgreSQL'],
    yearsOfExperience: 8,
    seniority: 'senior',
    languages: ['English'],
    summary: 'Builds backend services in Node.js and PostgreSQL.',
  },
}

const answering = fixedAnswerModel(JSON.stringify(answer), 'test-model')

const failing = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error('provider timeout')
  },
})

describe('extractProfile', () => {
  test('reads the text of the file, then stores the profile the LLM extracts', async () => {
    const candidateId = await uploadResume(samplePdf)

    await extractProfile(candidateId, '2026-11-01', answering)

    expect(await candidatesRepo.findResumeText(candidateId)).toBe(
      sampleResumeText
    )
    expect(await candidatesRepo.findById(candidateId)).toMatchObject({
      status: 'ready',
      name: 'Ana Souza',
      areas: ['engineering'],
      profile: answer.profile,
      profileGeneratedBy: {
        model: 'test-model',
        promptVersion: 'candidate-profile@1',
      },
    })
  })

  test('keeps the text when the LLM fails, so the next try only calls the LLM', async () => {
    const candidateId = await uploadResume(samplePdf)

    await expect(
      extractProfile(candidateId, '2026-11-01', failing)
    ).rejects.toThrow('provider timeout')

    expect(await candidatesRepo.findResumeText(candidateId)).toBe(
      sampleResumeText
    )
    expect((await candidatesRepo.findById(candidateId))?.status).toBe('pending')
  })

  test('the next try after an LLM failure reads the saved text, not the file', async () => {
    const candidateId = await uploadResume(samplePdf)
    await extractProfile(candidateId, '2026-11-01', failing).catch(() => {})
    const file = await resumeFilesRepo.findByCandidateId(candidateId)
    await (await fileStorage()).removeItem(file?.storageKey ?? '')

    await extractProfile(candidateId, '2026-11-01', answering)

    expect((await candidatesRepo.findById(candidateId))?.status).toBe('ready')
  })

  test('reads a DOCX the same way', async () => {
    const candidateId = await uploadResume(sampleDocx, 'carla.docx')

    await extractProfile(candidateId, '2026-11-01', answering)

    expect(await candidatesRepo.findResumeText(candidateId)).toBe(
      sampleResumeText
    )
  })

  test('cuts a text longer than the limit', async () => {
    const candidateId = await uploadResume(longDocx, 'long.docx')

    await extractProfile(candidateId, '2026-11-01', answering)

    expect((await candidatesRepo.findResumeText(candidateId))?.length).toBe(
      RESUME_TEXT_MAX_CHARS
    )
  })

  test('a file with no text fails with a reason', async () => {
    const candidateId = await uploadResume(blankPdf, 'scanned.pdf')

    await expect(
      extractProfile(candidateId, '2026-11-01', answering)
    ).rejects.toThrow('the resume has no text')
  })

  test('skips a deleted candidate without reading the file or calling the LLM', async () => {
    const candidateId = await uploadResume(samplePdf)
    await candidatesRepo.softDelete(candidateId)

    await extractProfile(candidateId, '2026-11-01', failing)
  })
})
