import type { TaskHandlers } from '@/server/shared/queue/task-handler'
import { candidateExtractProfileHandler } from '@/server/tasks/candidate-extract-profile'
import { jobAnalyzeHandler } from '@/server/tasks/job-analyze'
import { maintenanceHandler } from '@/server/tasks/maintenance'

/** The handler of each task type the worker runs */
export const handlers: TaskHandlers = {
  'job.analyze': jobAnalyzeHandler,
  'candidate.extract_profile': candidateExtractProfileHandler,
  'maintenance.cleanup': maintenanceHandler,
}
