import { getJob } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

import { getJobEventSchema } from './get-job.schemas'

/** One live job; 404 when it does not exist or was deleted */
export const handler = httpHandler((event) => getJob(event.pathParameters.id), {
  eventSchema: getJobEventSchema,
})
