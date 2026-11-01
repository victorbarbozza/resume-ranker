import { and, eq, inArray, lt, lte, sql } from 'drizzle-orm'

import { db, type Executor } from '@/server/shared/connectors/postgres'
import { tasks as tasksTable } from '@/server/shared/database/schema'
import type {
  ITask,
  TaskPayloads,
  TaskType,
} from '@/server/shared/schemas/task.schema'

/** A tasks row as Drizzle returns it */
type TaskRow = typeof tasksTable.$inferSelect

/** Maps a row to the task the rest of the server sees */
const toTask = (row: TaskRow): ITask => ({
  id: row.id,
  type: row.type,
  payload: row.payload as TaskPayloads[TaskType],
  status: row.status,
  attempts: row.attempts,
  runAt: row.runAt.toISOString(),
  lockedAt: row.lockedAt?.toISOString() ?? null,
  lastError: row.lastError,
  createdAt: row.createdAt.toISOString(),
})

/** A moment `ms` from now, by the database clock, which every process shares */
const fromNow = (ms: number) => sql`now() + make_interval(secs => ${ms / 1000})`

/** A moment `ms` ago, by the database clock */
const ago = (ms: number) => sql`now() - make_interval(secs => ${ms / 1000})`

/**
 * Adds a task to the queue. Pass the transaction that writes the row the task
 * refers to, so both commit or roll back together.
 */
export const enqueue = async <Type extends TaskType>(
  type: Type,
  payload: TaskPayloads[Type],
  executor: Executor = db
): Promise<ITask> => {
  const [row] = await executor
    .insert(tasksTable)
    .values({ type, payload })
    .returning()
  return toTask(row)
}

/**
 * Schedules the next run of a recurring task type, unless one is already
 * pending. Returns whether a task was added.
 */
export const scheduleRecurring = async (
  type: TaskType,
  delayMs: number
): Promise<boolean> => {
  const rows = await db
    .insert(tasksTable)
    .values({ type, payload: {}, runAt: fromNow(delayMs) })
    .onConflictDoNothing()
    .returning({ id: tasksTable.id })
  return rows.length > 0
}

/** A task by id */
export const findById = async (id: string): Promise<ITask | undefined> => {
  const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id))
  return row ? toTask(row) : undefined
}

/**
 * Claims the oldest queued task whose time has come and marks it running.
 * `FOR UPDATE SKIP LOCKED` makes concurrent workers skip a row another one is
 * claiming, so no task is ever handed out twice. Every claim bumps the
 * attempts.
 */
export const claimNext = async (): Promise<ITask | undefined> => {
  const next = db
    .select({ id: tasksTable.id })
    .from(tasksTable)
    .where(
      and(eq(tasksTable.status, 'queued'), lte(tasksTable.runAt, sql`now()`))
    )
    .orderBy(tasksTable.runAt)
    .limit(1)
    .for('update', { skipLocked: true })

  const [row] = await db
    .update(tasksTable)
    .set({
      status: 'running',
      lockedAt: sql`now()`,
      attempts: sql`${tasksTable.attempts} + 1`,
    })
    .where(inArray(tasksTable.id, next))
    .returning()
  return row ? toTask(row) : undefined
}

/**
 * Marks a claimed task done. The update only applies while the task is still
 * running with the attempts of this claim; if it was recovered and claimed
 * again, the newer run wins and this returns false.
 */
export const markDone = async (task: ITask): Promise<boolean> => {
  const rows = await db
    .update(tasksTable)
    .set({ status: 'done', lockedAt: null, lastError: null })
    .where(
      and(
        eq(tasksTable.id, task.id),
        eq(tasksTable.status, 'running'),
        eq(tasksTable.attempts, task.attempts)
      )
    )
    .returning({ id: tasksTable.id })
  return rows.length > 0
}

/** Sends a failed task back to the queue after a delay, keeping the error; same claim check as markDone */
export const scheduleRetry = async (
  task: ITask,
  error: string,
  delayMs: number
): Promise<boolean> => {
  const rows = await db
    .update(tasksTable)
    .set({
      status: 'queued',
      runAt: fromNow(delayMs),
      lockedAt: null,
      lastError: error,
    })
    .where(
      and(
        eq(tasksTable.id, task.id),
        eq(tasksTable.status, 'running'),
        eq(tasksTable.attempts, task.attempts)
      )
    )
    .returning({ id: tasksTable.id })
  return rows.length > 0
}

/** Sends a task back to the queue after a delay and gives back the attempt it used; same claim check as markDone */
export const postpone = async (
  task: ITask,
  reason: string,
  delayMs: number
): Promise<boolean> => {
  const rows = await db
    .update(tasksTable)
    .set({
      status: 'queued',
      runAt: fromNow(delayMs),
      attempts: sql`${tasksTable.attempts} - 1`,
      lockedAt: null,
      lastError: reason,
    })
    .where(
      and(
        eq(tasksTable.id, task.id),
        eq(tasksTable.status, 'running'),
        eq(tasksTable.attempts, task.attempts)
      )
    )
    .returning({ id: tasksTable.id })
  return rows.length > 0
}

/** Marks a claimed task dead, so it is not tried again; same claim check as markDone */
export const markDead = async (
  task: ITask,
  error: string
): Promise<boolean> => {
  const rows = await db
    .update(tasksTable)
    .set({ status: 'dead', lockedAt: null, lastError: error })
    .where(
      and(
        eq(tasksTable.id, task.id),
        eq(tasksTable.status, 'running'),
        eq(tasksTable.attempts, task.attempts)
      )
    )
    .returning({ id: tasksTable.id })
  return rows.length > 0
}

/**
 * Sends running tasks whose lock is older than the timeout back to the queue:
 * their worker stopped before settling them. Returns how many went back.
 */
export const recoverStale = async (timeoutMs: number): Promise<number> => {
  const rows = await db
    .update(tasksTable)
    .set({ status: 'queued', lockedAt: null })
    .where(
      and(
        eq(tasksTable.status, 'running'),
        lt(tasksTable.lockedAt, ago(timeoutMs))
      )
    )
    .returning({ id: tasksTable.id })
  return rows.length
}
