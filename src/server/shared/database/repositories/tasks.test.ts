import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq, sql } from 'drizzle-orm'

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

const enqueueProfile = () =>
  tasksRepo.enqueue('candidate.extract_profile', {
    candidateId: crypto.randomUUID(),
  })

const claim = async () => {
  const task = await tasksRepo.claimNext()
  if (!task) throw new Error('nothing to claim')
  return task
}

describe('tasks queue', () => {
  test('claims the oldest ready task and marks it running', async () => {
    const first = await enqueueProfile()
    await enqueueProfile()

    const claimed = await claim()

    expect(claimed).toMatchObject({
      id: first.id,
      status: 'running',
      attempts: 1,
    })
    expect(claimed.lockedAt).not.toBeNull()
  })

  test('leaves a task alone until its time comes', async () => {
    const task = await enqueueProfile()
    await db
      .update(tasks)
      .set({ runAt: sql`now() + interval '1 minute'` })
      .where(eq(tasks.id, task.id))

    expect(await tasksRepo.claimNext()).toBeUndefined()
  })

  test('never hands the same task to two concurrent claims', async () => {
    await Promise.all([enqueueProfile(), enqueueProfile(), enqueueProfile()])

    const concurrent = await Promise.all(
      Array.from({ length: 8 }, () => tasksRepo.claimNext())
    )
    const claimedIds = concurrent.flatMap((task) => (task ? [task.id] : []))
    for (
      let next = await tasksRepo.claimNext();
      next;
      next = await tasksRepo.claimNext()
    ) {
      claimedIds.push(next.id)
    }

    expect(claimedIds).toHaveLength(3)
    expect(new Set(claimedIds).size).toBe(3)
  })

  test('settles a task only while its claim holds', async () => {
    await enqueueProfile()
    const first = await claim()
    await tasksRepo.recoverStale(0)
    const second = await claim()

    expect(second.attempts).toBe(2)
    expect(await tasksRepo.markDone(first)).toBe(false)
    expect(await tasksRepo.markDone(second)).toBe(true)
    expect((await tasksRepo.findById(second.id))?.status).toBe('done')
  })

  test('a retry waits for its delay and keeps the error', async () => {
    await enqueueProfile()
    const task = await claim()

    await tasksRepo.scheduleRetry(task, 'provider timeout', 10_000)
    const saved = await tasksRepo.findById(task.id)

    expect(saved).toMatchObject({
      status: 'queued',
      attempts: 1,
      lockedAt: null,
      lastError: 'provider timeout',
    })
    expect(Date.parse(saved?.runAt ?? '') - Date.now()).toBeGreaterThan(8_000)
    expect(await tasksRepo.claimNext()).toBeUndefined()
  })

  test('postponing gives back the attempt the claim used', async () => {
    await enqueueProfile()
    const task = await claim()

    await tasksRepo.postpone(task, 'rate limited', 30_000)

    expect(await tasksRepo.findById(task.id)).toMatchObject({
      status: 'queued',
      attempts: 0,
      lastError: 'rate limited',
    })
  })

  test('a buried task is dead and never claimed again', async () => {
    await enqueueProfile()
    const task = await claim()

    await tasksRepo.markDead(task, 'gave up')

    expect(await tasksRepo.findById(task.id)).toMatchObject({
      status: 'dead',
      lastError: 'gave up',
    })
    expect(await tasksRepo.claimNext()).toBeUndefined()
  })

  test('sends back to the queue only tasks whose lock is old', async () => {
    await enqueueProfile()
    await claim()

    expect(await tasksRepo.recoverStale(60_000)).toBe(0)
    expect(await tasksRepo.recoverStale(0)).toBe(1)
    expect((await claim()).attempts).toBe(2)
  })

  test('keeps at most one pending task of a recurring type', async () => {
    expect(await tasksRepo.scheduleRecurring('maintenance.cleanup', 0)).toBe(
      true
    )
    expect(await tasksRepo.scheduleRecurring('maintenance.cleanup', 0)).toBe(
      false
    )

    const running = await claim()
    expect(await tasksRepo.scheduleRecurring('maintenance.cleanup', 0)).toBe(
      false
    )

    await tasksRepo.markDone(running)
    expect(
      await tasksRepo.scheduleRecurring('maintenance.cleanup', 600_000)
    ).toBe(true)
  })
})
