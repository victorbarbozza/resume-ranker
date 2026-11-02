import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'

import { db } from '@/server/shared/connectors/postgres'
import * as storage from '@/server/shared/connectors/storage'
import { candidates } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { samplePdf, uniquePdf } from '@/server/test/files'

import { uploadResumes } from './upload-resumes'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const consoleError = spyOn(console, 'error').mockImplementation(() => {})
afterEach(() => consoleError.mockClear())

const resume = () => new File([uniquePdf()], 'resume.pdf')

describe('uploadResumes', () => {
  test('five uploads of one file at the same time create one candidate', async () => {
    const batches = await Promise.all(
      Array.from({ length: 5 }, () =>
        uploadResumes([new File([samplePdf], 'ana.pdf')])
      )
    )

    const statuses = batches.flat().map((result) => result.status)

    expect(statuses.filter((status) => status === 'accepted')).toHaveLength(1)
    expect(statuses.filter((status) => status === 'duplicate')).toHaveLength(4)
    expect(await db.$count(candidates)).toBe(1)
  })

  test('a file the storage cannot take is rejected, and the rest of the batch goes on', async () => {
    const putFile = spyOn(storage, 'putFile').mockImplementationOnce(
      async () => {
        throw new Error('storage unreachable')
      }
    )

    const results = await uploadResumes([resume(), resume()])
    putFile.mockRestore()

    expect(results.map((result) => result.status)).toEqual([
      'rejected',
      'accepted',
    ])
    expect(results[0]).toMatchObject({
      error: 'the file could not be stored; send it again',
    })
    expect(await db.$count(candidates)).toBe(1)
  })
})
