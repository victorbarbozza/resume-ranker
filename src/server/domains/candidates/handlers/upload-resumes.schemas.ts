import { Type } from 'typebox'

import { uploadedFileSchema } from '@/server/shared/http/uploaded-file'
import { UPLOAD_MAX_FILES } from '@/server/shared/schemas/candidate.schema'

/** POST /api/candidates: a multipart upload with one or more `files` */
export const uploadResumesEventSchema = Type.Object({
  body: Type.Object(
    {
      files: Type.Array(uploadedFileSchema, {
        minItems: 1,
        maxItems: UPLOAD_MAX_FILES,
      }),
    },
    { additionalProperties: false }
  ),
})
