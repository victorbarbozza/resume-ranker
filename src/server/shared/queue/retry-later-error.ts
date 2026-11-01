/**
 * Thrown by a task handler when the work must wait, as when the LLM provider
 * answers 429. The task runs again after the delay without spending an
 * attempt.
 */
export class RetryLaterError extends Error {
  readonly delayMs: number

  constructor(message: string, delayMs: number) {
    super(message)
    this.name = 'RetryLaterError'
    this.delayMs = delayMs
  }
}
