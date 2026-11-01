import type { TaskHandlers } from '@/server/shared/queue/task-handler'
import { jobAnalyzeHandler } from '@/server/tasks/job-analyze'
import { maintenanceHandler } from '@/server/tasks/maintenance'

/** The handler of each task type the worker runs */
export const handlers: TaskHandlers = {
  'job.analyze': jobAnalyzeHandler,
  'maintenance.cleanup': maintenanceHandler,
}
