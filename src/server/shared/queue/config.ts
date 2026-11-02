/** Wait before the next attempt of a failed task: 10 s, 20 s, 40 s, 80 s */
export const retryDelayMs = (attempt: number): number =>
  10_000 * 2 ** (attempt - 1)

/** A running task locked longer than this belonged to a worker that stopped, and goes back to the queue */
export const LOCK_TIMEOUT_MS = 5 * 60_000

/** Wait between polls while nothing is ready */
export const POLL_INTERVAL_MS = 2_000
