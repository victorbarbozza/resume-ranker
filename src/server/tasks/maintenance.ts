import * as rateLimitsRepo from '@/server/shared/database/repositories/rate-limits'
import * as sessionsRepo from '@/server/shared/database/repositories/sessions'
import type { TaskHandler } from '@/server/shared/queue/task-handler'

/** Rate-limit windows older than this can no longer limit anything and are deleted */
const RATE_LIMIT_RETENTION_MS = 60 * 60_000

/** What a maintenance run removed */
export type MaintenanceReport = { windows: number; sessions: number }

/** Deletes rate-limit windows past their use and expired sessions */
export const runMaintenance = async (): Promise<MaintenanceReport> => {
  const windows = await rateLimitsRepo.deleteOlderThan(
    new Date(Date.now() - RATE_LIMIT_RETENTION_MS)
  )
  const sessions = await sessionsRepo.deleteExpired()
  if (windows + sessions > 0) {
    console.info(
      `✓ Maintenance removed ${windows} rate-limit window(s) and ${sessions} expired session(s)`
    )
  }
  return { windows, sessions }
}

/** Handler of `maintenance.cleanup`, the recurring task the worker keeps scheduled */
export const maintenanceHandler: TaskHandler = {
  run: async () => {
    await runMaintenance()
  },
}
