/**
 * Thrown by a task handler when trying again cannot help, as when a file is
 * refused or the LLM declines the request. The task is dead on this attempt,
 * so no retry spends another call or another minute on it.
 */
export class FailNowError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FailNowError'
  }
}
