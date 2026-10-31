import type { TSchema } from 'typebox'
import { Compile } from 'typebox/compile'

import { HTTPError } from './http-error'

/** Request data handed to a handler: one plain object, validated as a whole */
export type HttpEvent = {
  body?: unknown
  pathParameters?: Record<string, string | string[]>
  queryStringParameters?: Record<string, string>
}

/** Second argument Next.js passes to a route handler */
type RouteContext = { params: Promise<Record<string, string | string[]>> }

export type HttpHandlerOptions = {
  /** Validates the whole event before the handler runs; a mismatch answers 400 */
  eventSchema?: TSchema
  /** Status of a successful response; 204 sends no body */
  successStatusCode?: number
}

const methodsWithoutBody = new Set(['GET', 'HEAD'])

const parseBody = async (request: Request): Promise<unknown> => {
  const text = await request.text()
  if (!text) return undefined
  try {
    return JSON.parse(text)
  } catch {
    throw new HTTPError('request body is not valid JSON', {
      statusCode: 400,
      code: 'INVALID_JSON',
    })
  }
}

const buildEvent = async (
  request: Request,
  context?: RouteContext
): Promise<HttpEvent> => {
  const event: HttpEvent = {}

  const params = context?.params ? await context.params : {}
  if (Object.keys(params).length > 0) event.pathParameters = params

  const query = Object.fromEntries(new URL(request.url).searchParams)
  if (Object.keys(query).length > 0) event.queryStringParameters = query

  if (!methodsWithoutBody.has(request.method)) {
    const body = await parseBody(request)
    if (body !== undefined) event.body = body
  }

  return event
}

const errorResponse = (error: unknown): Response => {
  if (error instanceof HTTPError && error.expose) {
    return Response.json(
      { ...error.errorData, error: error.code, message: error.message },
      { status: error.statusCode }
    )
  }

  // internals never reach the client: it only gets the code
  console.error('[http] request failed', error)
  const statusCode = error instanceof HTTPError ? error.statusCode : 500
  const code = error instanceof HTTPError ? error.code : 'ERR_INTERNAL'
  return Response.json(
    { error: code, message: 'Internal error' },
    { status: statusCode }
  )
}

/**
 * Turns a handler into a Next.js route handler.
 *
 * Builds the event from the request (body, path and query parameters),
 * validates it against `eventSchema`, answers with the handler's result as
 * JSON and maps any error to `{ error, message }`.
 */
export const httpHandler = <Event = HttpEvent, Output = unknown>(
  handlerFunction: (event: Event) => Promise<Output>,
  options: HttpHandlerOptions = {}
) => {
  const validator = options.eventSchema
    ? Compile(options.eventSchema)
    : undefined
  const successStatusCode = options.successStatusCode ?? 200

  return async (
    request: Request,
    context?: RouteContext
  ): Promise<Response> => {
    try {
      const event = await buildEvent(request, context)

      if (validator && !validator.Check(event)) {
        const details = validator.Errors(event).map((error) => ({
          path: error.instancePath,
          message: error.message,
        }))
        throw new HTTPError('invalid request', {
          statusCode: 400,
          code: 'VALIDATION_ERROR',
          errorData: { details },
        })
      }

      const output = await handlerFunction(event as Event)
      if (successStatusCode === 204) return new Response(null, { status: 204 })
      return Response.json(output, { status: successStatusCode })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
