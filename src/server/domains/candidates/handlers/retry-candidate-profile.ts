import { retryProfile } from '@/server/domains/candidates/services/candidates'
import { httpHandler } from '@/server/shared/http/handler'

import { retryCandidateProfileEventSchema } from './retry-candidate-profile.schemas'

/** Queues a failed profile again; answers 202 with the pending candidate, or 409 when the profile did not fail */
export const handler = httpHandler(
  (event) => retryProfile(event.pathParameters.id),
  { eventSchema: retryCandidateProfileEventSchema, successStatusCode: 202 }
)
