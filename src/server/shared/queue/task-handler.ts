import type { ITask, TaskType } from '@/server/shared/schemas/task.schema'

/**
 * What the worker calls for a task.
 *
 * - `run`: does the work; throwing retries the task with backoff, and a `RetryLaterError` postpones it
 * - `onDead`: called once the task gives up, to mark the row it refers to as failed
 */
export type TaskHandler = {
  run: (task: ITask) => Promise<void>
  onDead?: (task: ITask, error: string) => Promise<void>
}

/** The handler of each task type; a task whose type has none is marked dead */
export type TaskHandlers = Partial<Record<TaskType, TaskHandler>>
