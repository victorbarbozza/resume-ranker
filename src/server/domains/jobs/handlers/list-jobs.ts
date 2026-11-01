import { Type } from 'typebox'

import { listJobs } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

/** Every live job, newest first */
export const handler = httpHandler(async () => ({ jobs: await listJobs() }), {
  eventSchema: Type.Object({}),
})
