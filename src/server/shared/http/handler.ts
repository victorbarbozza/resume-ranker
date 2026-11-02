import type { Static, TSchema } from 'typebox'
import { Compile } from 'typebox/compile'

import { HTTPError } from './http-error'
import type { UploadedFile } from './uploaded-file'

/** Request data handed to a handler: one plain object, validated as a whole */
export type HttpEvent = {
  body?: unknown
  pathParameters?: Record<string, string | string[]>
  queryStringParameters?: Record<string, string>
}

/** Second argument Next.js passes to a route handler */
type RouteContext = { params: Promise<Record<string, string | string[]>> }

/**
 * Options of httpHandler.
 *
 * - `eventSchema`: validates the whole event before the handler runs, and gives the handler its event type; a mismatch answers 400. A route without input passes `Type.Object({})`
 * - `successStatusCode`: status of a successful response; 204 sends no body
 * - `maxBodyBytes`: largest body accepted, 1 MB by default; checked against Content-Length before the body is read, so over it answers 413, and a chunked body, which has no Content-Length, answers 411
 */
export type HttpHandlerOptions<Schema extends TSchema> = {
  eventSchema: Schema
  successStatusCode?: number
  maxBodyBytes?: number
}

/** Methods whose requests carry no body */
const methodsWithoutBody = new Set(['GET', 'HEAD'])

/** Largest body of a route that sets no maxBodyBytes: plenty for any JSON this API takes */
const DEFAULT_MAX_BODY_BYTES = 1024 * 1024

/**
 * Refuses a body over the limit from its Content-Length, before reading it. A
 * request with neither Content-Length nor Transfer-Encoding has no body.
 */
const checkBodySize = (request: Request, maxBytes: number) => {
  const length = request.headers.get('content-length')
  if (length === null) {
    if (!request.headers.has('transfer-encoding')) return
    throw new HTTPError('the request must state its size in Content-Length', {
      statusCode: 411,
      code: 'LENGTH_REQUIRED',
    })
  }
  if (Number(length) > maxBytes) {
    throw new HTTPError(
      `the request is over ${Math.round(maxBytes / 1024 / 1024)} MB`,
      { statusCode: 413, code: 'PAYLOAD_TOO_LARGE' }
    )
  }
}

/** Reads a multipart body. Every field is a list, since a field can repeat, and every file comes with its bytes; a file sent without a name is `unnamed` */
const parseMultipart = async (
  request: Request
): Promise<Record<string, (string | UploadedFile)[]>> => {
  let form: FormData
  try {
    form = await request.formData()
  } catch {
    throw new HTTPError('request body is not valid multipart', {
      statusCode: 400,
      code: 'INVALID_MULTIPART',
    })
  }

  const fields = new Map<string, (string | UploadedFile)[]>()
  for (const [field, value] of form) {
    const item =
      typeof value === 'string'
        ? value
        : {
            name: value.name || 'unnamed',
            type: value.type,
            bytes: new Uint8Array(await value.arrayBuffer()),
          }
    const list = fields.get(field) ?? []
    list.push(item)
    fields.set(field, list)
  }
  return Object.fromEntries(fields)
}

/** Parses the JSON body; an empty body is undefined and malformed JSON answers 400 */
const parseJson = async (request: Request): Promise<unknown> => {
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

/** Gathers the body, path and query parameters into one event */
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
    const multipart = request.headers
      .get('content-type')
      ?.startsWith('multipart/form-data')
    const body = multipart
      ? await parseMultipart(request)
      : await parseJson(request)
    if (body !== undefined) event.body = body
  }

  return event
}

/** Exposed errors answer with their message; any other error is logged and answers only its code */
const errorResponse = (error: unknown): Response => {
  if (error instanceof HTTPError && error.expose) {
    return Response.json(
      { ...error.errorData, error: error.code, message: error.message },
      { status: error.statusCode }
    )
  }

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
 * Builds the event from the request (a JSON or multipart body, path and query parameters),
 * validates it against `eventSchema`, answers with the handler's result as
 * JSON and maps any error to `{ error, message }`. The handler's event type
 * comes from the schema, so the two cannot disagree.
 */
export const httpHandler = <Schema extends TSchema, Output>(
  handlerFunction: (event: Static<Schema>) => Promise<Output>,
  options: HttpHandlerOptions<Schema>
) => {
  const validator = Compile(options.eventSchema)
  const successStatusCode = options.successStatusCode ?? 200

  return async (
    request: Request,
    context?: RouteContext
  ): Promise<Response> => {
    try {
      if (!methodsWithoutBody.has(request.method)) {
        checkBodySize(request, options.maxBodyBytes ?? DEFAULT_MAX_BODY_BYTES)
      }
      const event = await buildEvent(request, context)

      if (!validator.Check(event)) {
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

      const output = await handlerFunction(event)
      if (successStatusCode === 204) return new Response(null, { status: 204 })
      return Response.json(output, { status: successStatusCode })
    } catch (error) {
      return errorResponse(error)
    }
  }
}
