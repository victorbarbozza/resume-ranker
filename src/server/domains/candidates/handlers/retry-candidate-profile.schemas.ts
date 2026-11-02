import { Type } from 'typebox'

/** POST /api/candidates/:id/retry */
export const retryCandidateProfileEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
})
