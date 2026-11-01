import { createJob } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

import { createJobEventSchema } from './create-job.schemas'

/** Creates a job and queues its analysis; answers 201 with the pending job */
export const handler = httpHandler((event) => createJob(event.body), {
  eventSchema: createJobEventSchema,
  successStatusCode: 201,
})
