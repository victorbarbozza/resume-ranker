import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { fixedAnswerModel } from '@/server/shared/connectors/llm'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf, sampleResumeText } from '@/server/test/files'

import { extractProfile } from './extract-profile'
import { uploadResumes } from './upload-resumes'

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

const uploadOne = async (bytes: Uint8Array, name = 'ana.pdf') => {
  const { accepted } = await uploadResumes([
    { name, type: '', bytes: new Uint8Array(bytes) },
  ])
  return accepted[0].candidateId
}

describe('extractProfile', () => {
  test('reads the text of the file, then stores the profile the LLM extracts', async () => {
    const candidateId = await uploadOne(samplePdf)

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
    const candidateId = await uploadOne(samplePdf)

    await expect(
      extractProfile(candidateId, '2026-11-01', failing)
    ).rejects.toThrow('provider timeout')

    expect(await candidatesRepo.findResumeText(candidateId)).toBe(
      sampleResumeText
    )
    expect((await candidatesRepo.findById(candidateId))?.status).toBe('pending')
  })

  test('a file with no text fails with a reason', async () => {
    const candidateId = await uploadOne(
      new TextEncoder().encode('   \n  '),
      'blank.txt'
    )

    await expect(
      extractProfile(candidateId, '2026-11-01', answering)
    ).rejects.toThrow('the resume has no text')
  })

  test('skips a deleted candidate without reading the file or calling the LLM', async () => {
    const candidateId = await uploadOne(samplePdf)
    await candidatesRepo.softDelete(candidateId)

    await extractProfile(candidateId, '2026-11-01', failing)
  })
})
