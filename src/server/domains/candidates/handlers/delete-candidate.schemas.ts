import { Type } from 'typebox'

/** DELETE /api/candidates/:id */
export const deleteCandidateEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
})
