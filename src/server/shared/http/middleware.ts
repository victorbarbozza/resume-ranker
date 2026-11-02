import { bodyLimit } from 'hono/body-limit'
import type { TLocalizedValidationError } from 'typebox/error'

import { HTTPError } from './http-error'

/** Largest body of a route that sets no limit of its own: plenty for any JSON this API takes */
export const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

/**
 * Refuses a body over the limit as it streams in, so an oversized request is
 * never read whole; answers 413. Every route that reads a body uses it.
 */
export const limitBody = (maxBytes = DEFAULT_MAX_BODY_BYTES) =>
  bodyLimit({
    maxSize: maxBytes,
    onError: () => {
      throw new HTTPError(
        `the request is over ${Math.round(maxBytes / 1024 / 1024)} MB`,
        { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' }
      )
    },
  })

/**
 * The hook every validator uses: a request that does not match its schema
 * answers 400 with where and why.
 */
export const rejectInvalid = (
  result:
    { success: true } | { success: false; errors: TLocalizedValidationError[] }
): void => {
  if (result.success) return
  throw new HTTPError('invalid request', {
    statusCode: 400,
    code: 'VALIDATION_ERROR',
    errorData: {
      details: result.errors.map((error) => ({
        path: error.instancePath,
        message: error.message,
      })),
    },
  })
}
