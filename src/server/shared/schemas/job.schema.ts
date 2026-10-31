import { type Static, Type } from 'typebox'

import { generatedBySchema } from '@/server/shared/schemas/generated-by.schema'
import { AREAS } from '@/shared/areas'

/** Lifecycle of a job's analysis: pending, then ready or failed */
export const JOB_STATUSES = ['pending', 'ready', 'failed'] as const
/** One of JOB_STATUSES */
export type JobStatus = (typeof JOB_STATUSES)[number]

/** Longest job title accepted */
export const JOB_TITLE_MAX_LENGTH = 200
/** Longest job description accepted */
export const JOB_DESCRIPTION_MAX_LENGTH = 20_000

/** Requirements the LLM extracts from a job description */
export const jobRequirementsSchema = Type.Object({
  mustHave: Type.Array(Type.String()),
  niceToHave: Type.Array(Type.String()),
})

/** Requirements as the LLM extracts them */
export type IJobRequirements = Static<typeof jobRequirementsSchema>

/**
 * A job as the API returns it.
 *
 * - `requirements`: null until the job.analyze task finishes
 */
export const jobSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  title: Type.String({ maxLength: JOB_TITLE_MAX_LENGTH }),
  description: Type.String({ maxLength: JOB_DESCRIPTION_MAX_LENGTH }),
  area: Type.Enum(AREAS),
  requirements: Type.Union([jobRequirementsSchema, Type.Null()]),
  requirementsGeneratedBy: Type.Union([generatedBySchema, Type.Null()]),
  status: Type.Enum(JOB_STATUSES),
  version: Type.Integer({ minimum: 1 }),
  createdAt: Type.String({ format: 'date-time' }),
  updatedAt: Type.String({ format: 'date-time' }),
})

/** A job as the API returns it */
export type IJob = Static<typeof jobSchema>
