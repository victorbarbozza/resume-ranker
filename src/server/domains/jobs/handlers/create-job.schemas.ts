import { Type } from 'typebox'

import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@/server/shared/schemas/job.schema'
import { AREAS } from '@/shared/areas'

/** POST /api/jobs: what a person fills in to create a job */
export const createJobEventSchema = Type.Object({
  body: Type.Object(
    {
      title: Type.String({ minLength: 1, maxLength: JOB_TITLE_MAX_LENGTH }),
      description: Type.String({
        minLength: 1,
        maxLength: JOB_DESCRIPTION_MAX_LENGTH,
      }),
      area: Type.Enum(AREAS),
    },
    { additionalProperties: false }
  ),
})
