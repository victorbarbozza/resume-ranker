import { type Static, Type } from 'typebox'

import { generatedBySchema } from '@/server/shared/schemas/generated-by.schema'

/** Lifecycle of an evaluation: queued, then done or failed */
export const EVALUATION_STATUSES = ['queued', 'done', 'failed'] as const
/** One of EVALUATION_STATUSES */
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number]

/**
 * One job and candidate result.
 *
 * - `jobVersion`: lower than the job's current version means the result is stale
 * - `score`, `summary`, `strengths`, `gaps`, `generatedBy`: empty until the evaluation is done
 */
export const evaluationSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  candidateId: Type.String({ format: 'uuid' }),
  jobVersion: Type.Integer({ minimum: 1 }),
  status: Type.Enum(EVALUATION_STATUSES),
  score: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  summary: Type.Union([Type.String(), Type.Null()]),
  strengths: Type.Array(Type.String()),
  gaps: Type.Array(Type.String()),
  generatedBy: Type.Union([generatedBySchema, Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

/** An evaluation as the API returns it */
export type IEvaluation = Static<typeof evaluationSchema>
