import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { uploadResumes } from '@/server/domains/candidates/services/upload-resumes'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf } from '@/server/test/files'
import { createCandidate } from '@/server/test/fixtures'

import { candidateExtractProfileHandler } from './candidate-extract-profile'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

describe('candidate.extract_profile handler', () => {
  test('extracts the profile of a valid payload with the configured model', async () => {
    const { accepted } = await uploadResumes([
      { name: 'ana.pdf', type: '', bytes: new Uint8Array(samplePdf) },
    ])
    const candidateId = accepted[0].candidateId
    const task = await tasksRepo.enqueue('candidate.extract_profile', {
      candidateId,
    })

    await candidateExtractProfileHandler.run(task)

    expect(await candidatesRepo.findById(candidateId)).toMatchObject({
      status: 'ready',
      profileGeneratedBy: { model: 'fake' },
    })
  })

  test('rejects a payload that does not match its schema', async () => {
    const task = await tasksRepo.enqueue('candidate.extract_profile', {
      candidateId: 'not-a-uuid',
    })

    await expect(candidateExtractProfileHandler.run(task)).rejects.toThrow(
      'candidate.extract_profile payload does not match its schema'
    )
  })

  test('marks the candidate failed once the task is dead', async () => {
    const candidate = await createCandidate()
    const task = await tasksRepo.enqueue('candidate.extract_profile', {
      candidateId: candidate.id,
    })

    await candidateExtractProfileHandler.onDead?.(task, 'provider timeout')

    expect((await candidatesRepo.findById(candidate.id))?.status).toBe('failed')
  })
})
