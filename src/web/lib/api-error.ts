/** Error thrown by `fetchJson` for any non-2xx answer from the API */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly data: Record<string, unknown>

  constructor(
    code: string,
    status: number,
    message: string,
    data: Record<string, unknown> = {}
  ) {
    super(message)
    this.name = 'ApiError'
    this.code = code
    this.status = status
    this.data = data
  }
}

/** Error body the API sends: `{ error, message }` plus any extra fields */
type ErrorBody = { error?: string; message?: string } & Record<string, unknown>

/**
 * Runs a fetch and returns its JSON body, or throws `ApiError` with the
 * `{ error, message }` the server sent. A 204 or an empty body comes back as
 * an empty object.
 */
export const fetchJson = async <T>(
  doFetch: () => Promise<Response>
): Promise<T> => {
  const response = await doFetch()
  const body: unknown = await response.json().catch(() => ({}))

  if (!response.ok) {
    const errorBody = body as ErrorBody
    throw new ApiError(
      errorBody.error ?? 'ERR_UNKNOWN',
      response.status,
      errorBody.message ?? response.statusText,
      errorBody
    )
  }

  return body as T
}
