import { Type } from 'typebox'

import { rankingMaxCandidates } from '@/server/config/env'

/** The job id in the path of the ranking routes */
export const jobIdParam = Type.Object({ id: Type.String({ format: 'uuid' }) })

/** POST /api/jobs/:id/evaluations: every ready candidate of the job's area, or the ones picked by hand */
export const rankJobBody = Type.Union([
  Type.Object({ scope: Type.Literal('area') }, { additionalProperties: false }),
  Type.Object(
    {
      scope: Type.Literal('selected'),
      candidateIds: Type.Array(Type.String({ format: 'uuid' }), {
        minItems: 1,
        maxItems: rankingMaxCandidates,
      }),
    },
    { additionalProperties: false }
  ),
])
