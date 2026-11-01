import { Type } from 'typebox'

import {
  JOB_DESCRIPTION_MAX_LENGTH,
  JOB_TITLE_MAX_LENGTH,
} from '@/server/shared/schemas/job.schema'
import { AREAS } from '@/shared/areas'

/** PATCH /api/jobs/:id: any of the fields a person fills in, at least one */
export const updateJobEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
  body: Type.Object(
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
  ),
})
