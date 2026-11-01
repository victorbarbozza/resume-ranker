import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import { candidates } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createCandidate } from '@/server/test/fixtures'

import * as resumeFilesRepo from './resume-files'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const content = Buffer.from([0x25, 0x50, 0x44, 0x46, 0x00, 0xff, 0x0a])

describe('resume files repository', () => {
  test('stores the original bytes exactly', async () => {
    const candidate = await createCandidate()

    await resumeFilesRepo.create(candidate.id, {
      content,
      mimeType: 'application/pdf',
    })
    const file = await resumeFilesRepo.findByCandidateId(candidate.id)

    expect(file?.mimeType).toBe('application/pdf')
    expect(file?.sizeBytes).toBe(content.byteLength)
    expect(file && Buffer.compare(file.content, content)).toBe(0)
  })

  test('the database rejects an empty file', async () => {
    const candidate = await createCandidate()

    await expect(
      resumeFilesRepo.create(candidate.id, {
        content: Buffer.alloc(0),
        mimeType: 'text/plain',
      })
    ).rejects.toThrow()
  })

  test('is removed when its candidate row is removed', async () => {
    const candidate = await createCandidate()
    await resumeFilesRepo.create(candidate.id, {
      content,
      mimeType: 'application/pdf',
    })

    await db.delete(candidates).where(eq(candidates.id, candidate.id))

    expect(
      await resumeFilesRepo.findByCandidateId(candidate.id)
    ).toBeUndefined()
  })
})
