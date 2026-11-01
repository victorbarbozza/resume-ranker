import { type Static, Type } from 'typebox'

/** Every kind of work the worker does */
export const TASK_TYPES = [
  'job.analyze',
  'candidate.extract_profile',
  'candidates.evaluate',
  'maintenance.cleanup',
] as const
/** One of TASK_TYPES */
export type TaskType = (typeof TASK_TYPES)[number]

/**
 * Settings of one task type.
 *
 * - `maxAttempts`: runs before the task is marked dead
 * - `repeatEveryMs`: set on the types the worker keeps scheduled on its own, with the gap between runs
 */
export type TaskConfig = { maxAttempts: number; repeatEveryMs?: number }

/** The settings of every task type */
export const TASKS: Record<TaskType, TaskConfig> = {
  'job.analyze': { maxAttempts: 5 },
  'candidate.extract_profile': { maxAttempts: 5 },
  'candidates.evaluate': { maxAttempts: 5 },
  'maintenance.cleanup': { maxAttempts: 1, repeatEveryMs: 10 * 60_000 },
}

/** Task types the worker keeps scheduled on its own, one pending run at a time */
export const RECURRING_TASK_TYPES = TASK_TYPES.filter(
  (type) => TASKS[type].repeatEveryMs !== undefined
)

/** Lifecycle of a task: queued, running, then done, or dead after the last failed attempt */
export const TASK_STATUSES = ['queued', 'running', 'done', 'dead'] as const
/** One of TASK_STATUSES */
export type TaskStatus = (typeof TASK_STATUSES)[number]

/** Payload of job.analyze: the job and the version to analyse */
export const jobAnalyzePayloadSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  version: Type.Integer({ minimum: 1 }),
})

/** Payload of candidate.extract_profile */
export const candidateExtractProfilePayloadSchema = Type.Object({
  candidateId: Type.String({ format: 'uuid' }),
})

/** Payload of candidates.evaluate: one batch for one job version */
export const candidatesEvaluatePayloadSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  jobVersion: Type.Integer({ minimum: 1 }),
  candidateIds: Type.Array(Type.String({ format: 'uuid' }), { minItems: 1 }),
})

/** Payload of maintenance.cleanup, which needs none */
export const maintenanceCleanupPayloadSchema = Type.Object({})

/**
 * The payload each task type carries. enqueue checks it at compile time, and
 * each handler validates it against the schema before using it.
 */
export type TaskPayloads = {
  'job.analyze': Static<typeof jobAnalyzePayloadSchema>
  'candidate.extract_profile': Static<
    typeof candidateExtractProfilePayloadSchema
  >
  'candidates.evaluate': Static<typeof candidatesEvaluatePayloadSchema>
  'maintenance.cleanup': Static<typeof maintenanceCleanupPayloadSchema>
}

/**
 * A task as the rest of the server sees it.
 *
 * - `payload`: as the database holds it; the handler validates it
 */
export type ITask = {
  id: string
  type: TaskType
  payload: unknown
  status: TaskStatus
  attempts: number
  runAt: string
  lockedAt: string | null
  lastError: string | null
  createdAt: string
}
