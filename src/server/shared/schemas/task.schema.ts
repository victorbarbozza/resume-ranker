/** Every kind of work the worker does, each with its own processor */
export const TASK_TYPES = [
  'job.analyze',
  'candidate.extract_profile',
  'candidates.evaluate',
] as const
/** One of TASK_TYPES */
export type TaskType = (typeof TASK_TYPES)[number]

/** Lifecycle of a task: queued, running, then done, or dead after the last failed attempt */
export const TASK_STATUSES = ['queued', 'running', 'done', 'dead'] as const
/** One of TASK_STATUSES */
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** The payload each task type carries; enqueue checks it at compile time */
export type TaskPayloads = {
  'job.analyze': { jobId: string; version: number }
  'candidate.extract_profile': { candidateId: string }
  'candidates.evaluate': {
    jobId: string
    jobVersion: number
    candidateIds: string[]
  }
}

/** A task as the rest of the server sees it */
export type ITask<Type extends TaskType = TaskType> = {
  id: string
  type: Type
  payload: TaskPayloads[Type]
  status: TaskStatus
  attempts: number
  runAt: string
  lockedAt: string | null
  lastError: string | null
  createdAt: string
}
