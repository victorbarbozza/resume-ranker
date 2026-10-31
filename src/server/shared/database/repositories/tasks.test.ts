import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { db } from '@/server/shared/connectors/postgres'
import { tasks } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'

import * as jobsRepo from './jobs'
import * as tasksRepo from './tasks'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

describe('tasks repository', () => {
  test('enqueues a task that can run right away', async () => {
    const before = Date.now()
    const candidateId = crypto.randomUUID()

    const task = await tasksRepo.enqueue('candidate.extract_profile', {
      candidateId,
    })

    expect(task).toMatchObject({
      type: 'candidate.extract_profile',
      payload: { candidateId },
      status: 'queued',
      attempts: 0,
      lockedAt: null,
      lastError: null,
    })
    expect(Date.parse(task.runAt)).toBeGreaterThanOrEqual(before - 1_000)
    expect(await tasksRepo.findById(task.id)).toEqual(task)
  })

  test('a task commits or rolls back with the row it refers to', async () => {
    const failedWrite = db.transaction(async (tx) => {
      const job = await jobsRepo.create(
        { title: 'Data Engineer', description: 'Spark.', area: 'data' },
        tx
      )
      await tasksRepo.enqueue('job.analyze', { jobId: job.id, version: 1 }, tx)
      throw new Error('write failed after enqueue')
    })

    await expect(failedWrite).rejects.toThrow('write failed after enqueue')
    expect(await jobsRepo.list()).toEqual([])
    expect(await db.select().from(tasks)).toEqual([])
  })
})
