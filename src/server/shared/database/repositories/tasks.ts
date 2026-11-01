import { eq } from 'drizzle-orm'

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

/**
 * Adds a task to the queue. Pass the transaction that writes the row the task
 * refers to, so both commit or roll back together.
 */
export const enqueue = async <Type extends TaskType>(
  type: Type,
  payload: TaskPayloads[Type],
  executor: Executor = db
): Promise<ITask<Type>> => {
  const [row] = await executor
    .insert(tasksTable)
    .values({ type, payload })
    .returning()
  return toTask(row) as ITask<Type>
}

/** A task by id */
export const findById = async (id: string): Promise<ITask | undefined> => {
  const [row] = await db.select().from(tasksTable).where(eq(tasksTable.id, id))
  return row ? toTask(row) : undefined
}
