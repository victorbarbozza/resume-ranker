import { Type } from 'typebox'

/** GET /api/jobs/:id */
export const getJobEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
})
