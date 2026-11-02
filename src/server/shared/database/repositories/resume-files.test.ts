import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import { candidates } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createCandidate } from '@/server/test/fixtures'

import * as resumeFilesRepo from './resume-files'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const file = {
  storageKey: 'resumes:abc123',
  mimeType: 'application/pdf',
  sizeBytes: 48_000,
}

describe('resume files repository', () => {
  test('records where the original upload lives', async () => {
    const candidate = await createCandidate()

    await resumeFilesRepo.create(candidate.id, file)

    expect(await resumeFilesRepo.findByCandidateId(candidate.id)).toEqual(file)
  })

  test('the database rejects an empty file and one over 2 MB', async () => {
    const candidate = await createCandidate()

    await expect(
      resumeFilesRepo.create(candidate.id, { ...file, sizeBytes: 0 })
    ).rejects.toThrow()
    await expect(
      resumeFilesRepo.create(candidate.id, {
        ...file,
        sizeBytes: 2 * 1024 * 1024 + 1,
      })
    ).rejects.toThrow()
  })

  test('is removed when its candidate row is removed', async () => {
    const candidate = await createCandidate()
    await resumeFilesRepo.create(candidate.id, file)

    await db.delete(candidates).where(eq(candidates.id, candidate.id))

    expect(
      await resumeFilesRepo.findByCandidateId(candidate.id)
    ).toBeUndefined()
  })
})
