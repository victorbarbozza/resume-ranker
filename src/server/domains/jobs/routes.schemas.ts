import { Type } from 'typebox'

import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@/server/shared/schemas/job.schema'
import { AREAS } from '@/shared/areas'

/** The id in the path of every route of one job */
export const jobIdParam = Type.Object({ id: Type.String({ format: 'uuid' }) })

/** POST /api/jobs: what a person fills in to create a job */
export const createJobBody = Type.Object(
  {
    title: Type.String({ minLength: 1, maxLength: JOB_TITLE_MAX_LENGTH }),
    description: Type.String({
      minLength: 1,
      maxLength: JOB_DESCRIPTION_MAX_LENGTH,
    }),
    area: Type.Enum(AREAS),
  },
  { additionalProperties: false }
)

/** PATCH /api/jobs/:id: any of the fields a person fills in, at least one */
export const updateJobBody = Type.Object(
  {
    title: Type.Optional(
      Type.String({ minLength: 1, maxLength: JOB_TITLE_MAX_LENGTH })
    ),
    description: Type.Optional(
      Type.String({ minLength: 1, maxLength: JOB_DESCRIPTION_MAX_LENGTH })
    ),
    area: Type.Optional(Type.Enum(AREAS)),
  },
  { additionalProperties: false, minProperties: 1 }
)
