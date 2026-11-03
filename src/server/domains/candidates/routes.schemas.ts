import { Type } from 'typebox'

import { CANDIDATE_STATUSES } from '@/server/shared/schemas/candidate.schema'
import { AREAS } from '@/shared/areas'
import { DELETE_MAX_CANDIDATES, UPLOAD_MAX_FILES } from '@/shared/limits'

/**
 * GET /api/candidates: what the list filters by, and where the page starts.
 *
 * - `search`: part of the name
 * - `cursor`: the `nextCursor` of the previous page
 */
export const listCandidatesQuery = Type.Object({
  search: Type.Optional(Type.String({ maxLength: 200 })),
  area: Type.Optional(Type.Enum(AREAS)),
  status: Type.Optional(Type.Enum(CANDIDATE_STATUSES)),
  cursor: Type.Optional(Type.String({ format: 'uuid' })),
})

/** POST /api/candidates/delete: the candidates to delete */
export const deleteCandidatesBody = Type.Object({
  ids: Type.Array(Type.String({ format: 'uuid' }), {
    minItems: 1,
    maxItems: DELETE_MAX_CANDIDATES,
  }),
})

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
