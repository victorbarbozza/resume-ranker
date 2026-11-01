import { updateJob } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

import { updateJobEventSchema } from './update-job.schemas'

/** Edits a job, bumps its version and queues a new analysis */
export const handler = httpHandler(
  (event) => updateJob(event.pathParameters.id, event.body),
  { eventSchema: updateJobEventSchema }
)
