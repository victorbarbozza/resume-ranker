import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  mock,
  spyOn,
  test,
} from 'bun:test'
import { and, eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import * as rateLimitsRepo from '@/server/shared/database/repositories/rate-limits'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { rateLimits, tasks } from '@/server/shared/database/schema'
import { runMaintenance } from '@/server/tasks/maintenance'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'

import { RetryLaterError } from './retry-later-error'
import type { TaskHandlers } from './task-handler'
import { runTask, runWorker } from './worker'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const logs = [
  spyOn(console, 'info').mockImplementation(() => {}),
  spyOn(console, 'error').mockImplementation(() => {}),
]
afterEach(() => logs.forEach((log) => log.mockClear()))

const enqueueProfile = () =>
  tasksRepo.enqueue('candidate.extract_profile', {
    candidateId: crypto.randomUUID(),
  })

const runNext = async (handlers: TaskHandlers) => {
  const task = await tasksRepo.claimNext()
  if (!task) throw new Error('nothing to run')
  await runTask(task, handlers)
  return task
}

const failingWith = (error: Error) =>
  mock(async () => {
    throw error
  })

describe('runTask', () => {
  test('runs a task and marks it done', async () => {
    await enqueueProfile()
    const run = mock(async () => {})

    const task = await runNext({ 'candidate.extract_profile': { run } })

    expect(run).toHaveBeenCalledTimes(1)
    expect((await tasksRepo.findById(task.id))?.status).toBe('done')
  })

  test('a failure goes back to the queue for 10 seconds, with its error', async () => {
    await enqueueProfile()
    const run = failingWith(new Error('provider timeout'))

    const task = await runNext({ 'candidate.extract_profile': { run } })
    const saved = await tasksRepo.findById(task.id)

    expect(saved).toMatchObject({
      status: 'queued',
      attempts: 1,
      lastError: 'provider timeout',
    })
    expect(Date.parse(saved?.runAt ?? '') - Date.now()).toBeGreaterThan(8_000)
  })

  test('the last attempt marks the task dead and reports it', async () => {
    const queued = await enqueueProfile()
    await db.update(tasks).set({ attempts: 4 }).where(eq(tasks.id, queued.id))
    const onDead = mock(async () => {})
    const run = failingWith(new Error('still failing'))

    await runNext({ 'candidate.extract_profile': { run, onDead } })

    expect(await tasksRepo.findById(queued.id)).toMatchObject({
      status: 'dead',
      attempts: 5,
      lastError: 'still failing',
    })
    expect(onDead).toHaveBeenCalledWith(
      expect.objectContaining({ id: queued.id }),
      'still failing'
    )
  })

  test('a RetryLaterError postpones the task without spending an attempt', async () => {
    await enqueueProfile()
    const run = failingWith(new RetryLaterError('rate limited', 30_000))

    const task = await runNext({ 'candidate.extract_profile': { run } })
    const saved = await tasksRepo.findById(task.id)

    expect(saved).toMatchObject({ status: 'queued', attempts: 0 })
    expect(Date.parse(saved?.runAt ?? '') - Date.now()).toBeGreaterThan(28_000)
  })

  test('a task without a handler is marked dead', async () => {
    await enqueueProfile()

    const task = await runNext({})

    expect(await tasksRepo.findById(task.id)).toMatchObject({
      status: 'dead',
      lastError: 'no handler for candidate.extract_profile',
    })
  })

  test('a recurring task schedules its next run even when it dies', async () => {
    await tasksRepo.scheduleRecurring('maintenance.cleanup', 0)
    const run = failingWith(new Error('cleanup failed'))

    await runNext({ 'maintenance.cleanup': { run } })
    const runs = await db
      .select()
      .from(tasks)
      .where(eq(tasks.type, 'maintenance.cleanup'))
      .orderBy(tasks.createdAt)

    expect(runs.map((r) => r.status)).toEqual(['dead', 'queued'])
  })
})

describe('runWorker', () => {
  test('keeps maintenance scheduled and runs it along with the other tasks', async () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60_000)
    await rateLimitsRepo.increment('login:203.0.113.7', twoHoursAgo)
    const profileTask = await enqueueProfile()
    const stop = new AbortController()
    const handlers: TaskHandlers = {
      'candidate.extract_profile': { run: mock(async () => {}) },
      'maintenance.cleanup': {
        run: async () => {
          await runMaintenance()
          stop.abort()
        },
      },
    }

    await runWorker(handlers, stop.signal)
    const nextMaintenance = await db
      .select()
      .from(tasks)
      .where(
        and(eq(tasks.type, 'maintenance.cleanup'), eq(tasks.status, 'queued'))
      )

    expect((await tasksRepo.findById(profileTask.id))?.status).toBe('done')
    expect(await db.$count(rateLimits)).toBe(0)
    expect(nextMaintenance).toHaveLength(1)
    expect(nextMaintenance[0].runAt.getTime() - Date.now()).toBeGreaterThan(
      9 * 60_000
    )
  })
})
