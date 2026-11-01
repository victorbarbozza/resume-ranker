import { Type } from 'typebox'

/** POST /api/jobs/:id/analyze */
export const retryJobAnalysisEventSchema = Type.Object({
  pathParameters: Type.Object({ id: Type.String({ format: 'uuid' }) }),
})
