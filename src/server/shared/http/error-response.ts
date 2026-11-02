import type { Context } from 'hono'
import { HTTPException } from 'hono/http-exception'

import { defaultCodes, HTTPError } from './http-error'

/**
 * Turns any error into `{ error, message }`. An HTTPError a service threw
 * answers with its own status, code, message and headers; Hono's own errors,
 * such as malformed JSON or a form posted from another site, answer with their
 * status and message; anything else is logged and answers 500 without its
 * message, so internals never reach the client.
 */
export const errorResponse = (error: Error, c: Context): Response => {
  if (error instanceof HTTPError && error.expose) {
    return Response.json(
      { ...error.errorData, error: error.code, message: error.message },
      { status: error.statusCode, headers: error.headers }
    )
  }
  if (error instanceof HTTPException) {
    return Response.json(
      {
        error: defaultCodes[error.status] ?? 'ERR_BAD_REQUEST',
        message: error.message || 'request refused',
      },
      { status: error.status }
    )
  }

  console.error(`[http] ${c.req.method} ${c.req.path} failed`, error)
  const statusCode = error instanceof HTTPError ? error.statusCode : 500
  const code = error instanceof HTTPError ? error.code : 'ERR_INTERNAL'
  return Response.json(
    { error: code, message: 'Internal error' },
    { status: statusCode }
  )
}
