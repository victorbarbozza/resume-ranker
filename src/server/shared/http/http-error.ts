/** Error code for each status when the thrower gives none */
const defaultCodes: Record<number, string> = {
  400: 'ERR_BAD_REQUEST',
  401: 'ERR_UNAUTHORIZED',
  403: 'ERR_FORBIDDEN',
  404: 'ERR_NOT_FOUND',
  409: 'ERR_CONFLICT',
  413: 'ERR_PAYLOAD_TOO_LARGE',
  422: 'ERR_UNPROCESSABLE_ENTITY',
  429: 'ERR_TOO_MANY_REQUESTS',
  500: 'ERR_INTERNAL',
  502: 'ERR_BAD_GATEWAY',
  503: 'ERR_SERVICE_UNAVAILABLE',
}

/**
 * Options of an HTTPError.
 *
 * - `statusCode`: HTTP status code; 500 when omitted
 * - `code`: stable code the client can branch on; derived from the status when omitted
 * - `errorData`: extra fields merged into the error body
 * - `expose`: whether the message reaches the client; true below 500 by default
 */
export type HTTPErrorOptions = {
  statusCode?: number
  code?: string
  errorData?: Record<string, unknown>
  expose?: boolean
  cause?: unknown
}

/**
 * Error a service throws to end the request with a given status.
 * `httpHandler` turns it into `{ ...errorData, error: code, message }`.
 *
 * @example
 * throw new HTTPError('job not found', { statusCode: 404, code: 'JOB_NOT_FOUND' })
 */
export class HTTPError extends Error {
  statusCode: number
  code: string
  errorData: Record<string, unknown>
  expose: boolean

  constructor(message: string, options: HTTPErrorOptions = {}) {
    super(message, { cause: options.cause })
    this.name = 'HTTPError'
    this.statusCode = options.statusCode ?? 500
    this.code = options.code ?? defaultCodes[this.statusCode] ?? 'ERR_UNKNOWN'
    this.errorData = options.errorData ?? {}
    this.expose = options.expose ?? this.statusCode < 500
  }
}
