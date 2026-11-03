import { type Static, Type } from 'typebox'

import { SENIORITIES } from '@/server/shared/schemas/candidate.schema'
import { generatedBySchema } from '@/server/shared/schemas/generated-by.schema'

/** Lifecycle of an evaluation: queued, then done or failed */
export const EVALUATION_STATUSES = ['queued', 'done', 'failed'] as const
/** One of EVALUATION_STATUSES */
export type EvaluationStatus = (typeof EVALUATION_STATUSES)[number]

/** How a candidate measures up to one criterion: shows it, shows something close, or does not show it */
export const VERDICTS = ['met', 'partial', 'missing'] as const
/** One of VERDICTS */
export type Verdict = (typeof VERDICTS)[number]

/** The groups a criterion belongs to, each with its share of the score */
export const CRITERION_GROUPS = ['mustHave', 'niceToHave'] as const
/** One of CRITERION_GROUPS */
export type CriterionGroup = (typeof CRITERION_GROUPS)[number]

/**
 * How a candidate measures up to one criterion of the job.
 *
 * - `criterion`: `m1`, `m2`… for must-haves, `n1`… for nice-to-haves, `experience` for the experience the job asks for
 * - `requirement`: the requirement as the job states it; null for the experience criterion
 * - `evidence`: the passage of the resume that shows it, word for word; null when the verdict is missing
 * - `evidenceNotFound`: the model quoted a passage the resume does not have, so the verdict became missing
 * - `experience`: what the job asks and what the profile has, for the experience criterion only
 */
export const assessmentSchema = Type.Object({
  criterion: Type.String(),
  group: Type.Enum(CRITERION_GROUPS),
  weight: Type.Number({ minimum: 0 }),
  requirement: Type.Union([Type.String(), Type.Null()]),
  verdict: Type.Enum(VERDICTS),
  evidence: Type.Union([Type.String(), Type.Null()]),
  evidenceNotFound: Type.Boolean(),
  experience: Type.Union([
    Type.Object({
      minYears: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()]),
      seniority: Type.Union([Type.Enum(SENIORITIES), Type.Null()]),
      years: Type.Number({ minimum: 0 }),
      candidateSeniority: Type.Enum(SENIORITIES),
    }),
    Type.Null(),
  ]),
})

/** One assessment of a candidate against a criterion */
export type IAssessment = Static<typeof assessmentSchema>

/**
 * One job and candidate result.
 *
 * - `jobVersion`: lower than the job's current version means the result is stale
 * - `score`: computed from the assessments, never by the LLM
 * - `score`, `summary`, `assessments`, `generatedBy`: empty until the evaluation is done
 */
export const evaluationSchema = Type.Object({
  jobId: Type.String({ format: 'uuid' }),
  candidateId: Type.String({ format: 'uuid' }),
  jobVersion: Type.Integer({ minimum: 1 }),
  status: Type.Enum(EVALUATION_STATUSES),
  score: Type.Union([Type.Integer({ minimum: 0, maximum: 100 }), Type.Null()]),
  summary: Type.Union([Type.String(), Type.Null()]),
  assessments: Type.Array(assessmentSchema),
  generatedBy: Type.Union([generatedBySchema, Type.Null()]),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

/** An evaluation as the API returns it */
export type IEvaluation = Static<typeof evaluationSchema>
