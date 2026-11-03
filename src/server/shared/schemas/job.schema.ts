import { type Static, Type } from 'typebox'

import { SENIORITIES } from '@/server/shared/schemas/candidate.schema'
import { generatedBySchema } from '@/server/shared/schemas/generated-by.schema'
import { AREAS } from '@/shared/areas'
import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@/shared/limits'

/** Lifecycle of a job's analysis: pending, then ready or failed */
export const JOB_STATUSES = ['pending', 'ready', 'failed'] as const
/** One of JOB_STATUSES */
export type JobStatus = (typeof JOB_STATUSES)[number]

/** How much a must-have weighs: what the job centres on, or the rest */
export const REQUIREMENT_IMPORTANCES = ['primary', 'secondary'] as const
/** One of REQUIREMENT_IMPORTANCES */
export type RequirementImportance = (typeof REQUIREMENT_IMPORTANCES)[number]

/**
 * Requirements the LLM extracts from a job description. The general
 * experience the job asks for stays out of the lists: the code checks it
 * against the candidate's profile.
 */
export const jobRequirementsSchema = Type.Object(
  {
    mustHave: Type.Array(
      Type.Object(
        {
          text: Type.String({
            description:
              'One requirement, such as "Node.js" or "5+ anos de Node.js"',
          }),
          importance: Type.Enum(REQUIREMENT_IMPORTANCES, {
            description:
              'primary for what the job centres on, secondary for the rest',
          }),
        },
        { additionalProperties: false }
      ),
      { description: 'What the job states as required, one per item' }
    ),
    niceToHave: Type.Array(Type.String(), {
      description:
        'What the job marks as a plus, preferred or desirable, one per item',
    }),
    experience: Type.Object(
      {
        minYears: Type.Union([Type.Integer({ minimum: 0 }), Type.Null()], {
          description:
            'Total years of professional work the job asks for; null when it asks none',
        }),
        seniority: Type.Union([Type.Enum(SENIORITIES), Type.Null()], {
          description:
            'Career level the job asks for, such as senior in "Senior Backend Engineer"; null when it names none',
        }),
      },
      { additionalProperties: false }
    ),
  },
  { additionalProperties: false }
)

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
