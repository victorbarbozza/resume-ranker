import { deleteJob } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

import { deleteJobEventSchema } from './delete-job.schemas'

/** Hides a job; answers 204 */
export const handler = httpHandler(
  (event) => deleteJob(event.pathParameters.id),
  { eventSchema: deleteJobEventSchema, successStatusCode: 204 }
)
