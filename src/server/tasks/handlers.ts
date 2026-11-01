import type { TaskHandlers } from '@/server/shared/queue/task-handler'
import { maintenanceHandler } from '@/server/tasks/maintenance'

/** The handler of each task type the worker runs */
export const handlers: TaskHandlers = {
  'maintenance.cleanup': maintenanceHandler,
}
