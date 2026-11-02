import { DetailedError, hc } from 'hono/client'

import type { Api } from '@/server/api'
import { i18n } from '@/web/i18n'
import { API_ERROR_CODES, type ApiErrorCode } from '@/web/i18n/locales/errors'

/**
 * The API, with every path, input and answer typed from the server's routes,
 * such as `client.api.jobs.$post({ json })`. Calls go to the same origin:
 * the server in the image, the Vite proxy in development. Read an answer with
 * `parseResponse` from `hono/client`, which throws on any status but 2xx.
 */
export const client = hc<Api>('/')

/** A field the API refused, as `{ path: '/title', message }` */
export type FieldIssue = { path: string; message: string }

/**
 * Why a call failed, read from the `{ error, message, details }` body the API
 * answers with; `status` 0 means the server never answered.
 */
export type ApiFailure = {
  status: number
  code: string
  details: FieldIssue[]
}

/** Reads the failure out of the error `parseResponse` throws, or out of a network error */
export const toApiFailure = (error: unknown): ApiFailure => {
  if (!(error instanceof DetailedError)) {
    return { status: 0, code: 'ERR_NETWORK', details: [] }
  }
  const body = error.detail?.data
  return {
    status: error.statusCode ?? 0,
    code: typeof body?.error === 'string' ? body.error : 'UNKNOWN',
    details: Array.isArray(body?.details) ? body.details : [],
  }
}

/** The failure's code when the screen can explain it, otherwise `UNKNOWN` */
export const failureCode = (error: unknown): ApiErrorCode | 'UNKNOWN' => {
  const { code } = toApiFailure(error)
  return API_ERROR_CODES.find((item) => item === code) ?? 'UNKNOWN'
}

/** What the person reads about a failure, in their language; the server's own text never reaches them */
export const describeError = (error: unknown): string =>
  i18n.t(`errors.${failureCode(error)}`)
