import { Type } from 'typebox'

import { UPLOAD_MAX_FILES } from '@/shared/limits'

/** The id in the path of every route of one candidate */
export const candidateIdParam = Type.Object({
  id: Type.String({ format: 'uuid' }),
})

/** One file of a multipart upload; TypeBox has no file type, so it is checked with a refinement */
const uploadedFile = Type.Refine(
  Type.Unsafe<File>({}),
  (value) => value instanceof File
)

/**
 * POST /api/candidates: a multipart upload of one or more `files`. A field
 * sent once arrives as one value and a repeated one as a list, so both shapes
 * are accepted.
 */
export const uploadResumesForm = Type.Object({
  files: Type.Union([
    uploadedFile,
    Type.Array(uploadedFile, { minItems: 1, maxItems: UPLOAD_MAX_FILES }),
  ]),
})
