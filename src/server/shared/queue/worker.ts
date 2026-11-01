import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import {
  LOCK_TIMEOUT_MS,
  POLL_INTERVAL_MS,
  retryDelayMs,
} from '@/server/shared/queue/config'
import { RetryLaterError } from '@/server/shared/queue/retry-later-error'
import type { TaskHandlers } from '@/server/shared/queue/task-handler'
import {
  type ITask,
  RECURRING_TASK_TYPES,
  TASKS,
} from '@/server/shared/schemas/task.schema'

/** Waits for the delay, or less when the signal aborts */
const sleep = (ms: number, signal: AbortSignal): Promise<void> =>
  new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener('abort', () => {
      clearTimeout(timer)
      resolve()
    })
  })

/**
 * Runs one claimed task and records how it ended: done, retried after a
 * backoff, postponed without spending an attempt, or dead. A recurring task
 * then schedules its next run, which does nothing while a run is pending.
 */
export const runTask = async (
  task: ITask,
  handlers: TaskHandlers
): Promise<void> => {
  const config = TASKS[task.type]
  const handler = handlers[task.type]

  if (!handler) {
    await tasksRepo.markDead(task, `no handler for ${task.type}`)
    console.error(`✗ ${task.type} ${task.id} has no handler`)
    return
  }

  try {
    await handler.run(task)
    await tasksRepo.markDone(task)
    console.info(`✓ ${task.type} ${task.id} done`)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)

    if (error instanceof RetryLaterError) {
      await tasksRepo.postpone(task, message, error.delayMs)
      console.info(`${task.type} ${task.id} postponed: ${message}`)
    } else if (task.attempts < config.maxAttempts) {
      await tasksRepo.scheduleRetry(task, message, retryDelayMs(task.attempts))
      console.error(
        `✗ ${task.type} ${task.id} failed, attempt ${task.attempts} of ${config.maxAttempts}: ${message}`
      )
    } else {
      if (await tasksRepo.markDead(task, message)) {
        await handler.onDead?.(task, message)
      }
      console.error(`✗ ${task.type} ${task.id} dead: ${message}`)
    }
  }

  if (config.repeatEveryMs) {
    await tasksRepo.scheduleRecurring(task.type, config.repeatEveryMs)
  }
}

/**
 * Runs the queue until the signal aborts. It first makes sure every recurring
 * task type has a pending run; then each round sends stale tasks back to the
 * queue and runs the next ready task, or waits a poll interval when nothing
 * is ready. A failed round is logged and tried again after the interval. The
 * task in progress always finishes before the worker stops.
 */
export const runWorker = async (
  handlers: TaskHandlers,
  signal: AbortSignal
): Promise<void> => {
  for (const type of RECURRING_TASK_TYPES) {
    await tasksRepo.scheduleRecurring(type, 0)
  }

  while (!signal.aborted) {
    try {
      await tasksRepo.recoverStale(LOCK_TIMEOUT_MS)

      const task = await tasksRepo.claimNext()
      if (task) {
        await runTask(task, handlers)
        continue
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      console.error(`✗ Worker round failed: ${message}`)
    }
    await sleep(POLL_INTERVAL_MS, signal)
  }
}
