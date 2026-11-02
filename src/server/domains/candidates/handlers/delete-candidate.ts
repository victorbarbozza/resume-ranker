import { deleteCandidate } from '@/server/domains/candidates/services/candidates'
import { httpHandler } from '@/server/shared/http/handler'

import { deleteCandidateEventSchema } from './delete-candidate.schemas'

/** Hides a candidate; answers 204 */
export const handler = httpHandler(
  (event) => deleteCandidate(event.pathParameters.id),
  { eventSchema: deleteCandidateEventSchema, successStatusCode: 204 }
)
