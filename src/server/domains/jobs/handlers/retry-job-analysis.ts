import { retryAnalysis } from '@/server/domains/jobs/services/jobs'
import { httpHandler } from '@/server/shared/http/handler'

import { retryJobAnalysisEventSchema } from './retry-job-analysis.schemas'

/** Queues a failed analysis again; answers 202 with the pending job, or 409 when the analysis did not fail */
export const handler = httpHandler(
  (event) => retryAnalysis(event.pathParameters.id),
  { eventSchema: retryJobAnalysisEventSchema, successStatusCode: 202 }
)
