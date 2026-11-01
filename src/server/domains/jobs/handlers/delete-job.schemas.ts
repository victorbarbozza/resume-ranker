import { Type } from 'typebox'

/** DELETE /api/jobs/:id */
export const deleteJobEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
})
