import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  spyOn,
  test,
} from 'bun:test'

import * as health from '@/server/domains/health/services/health'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { uniquePdf } from '@/server/test/files'

import { api } from './api'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const consoleError = spyOn(console, 'error').mockImplementation(() => {})
afterEach(() => consoleError.mockClear())

const postJob = (body: string, headers: Record<string, string> = {}) =>
  api.request('/api/jobs', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json', ...headers },
  })

describe('api', () => {
  test('a body that is not JSON answers 400', async () => {
    const response = await postJob('{not json')

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('ERR_BAD_REQUEST')
  })

  test('a request that does not match its schema answers 400 with where and why', async () => {
    const response = await postJob(
      JSON.stringify({ title: '', description: 'x', area: 'engineering' })
    )
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.details[0].path).toBe('/title')
  })

  test('a body over 1 MB answers 413 before it is read', async () => {
    const response = await postJob('{}', {
      'Content-Length': String(2 * 1024 * 1024),
    })

    expect(response.status).toBe(413)
    expect((await response.json()).error).toBe('PAYLOAD_TOO_LARGE')
  })

  test('an unexpected error answers 500 without its message', async () => {
    const checkHealth = spyOn(health, 'checkHealth').mockImplementationOnce(
      async () => {
        throw new Error('connection refused at 10.0.0.5')
      }
    )

    const response = await api.request('/api/health')
    checkHealth.mockRestore()

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'ERR_INTERNAL',
      message: 'Internal error',
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  test('an unknown route answers 404 as JSON', async () => {
    const response = await api.request('/api/nothing-here')

    expect(response.status).toBe(404)
    expect((await response.json()).error).toBe('ERR_NOT_FOUND')
  })

  test('a text where a file belongs answers 400', async () => {
    const form = new FormData()
    form.append('files', 'not a file')

    const response = await api.request('/api/candidates', {
      method: 'POST',
      body: form,
    })

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('VALIDATION_ERROR')
  })

  test('a multipart field named __proto__ is just a field', async () => {
    const form = new FormData()
    form.append('__proto__', 'value')
    form.append('files', new File([uniquePdf()], 'resume.pdf'))

    const response = await api.request('/api/candidates', {
      method: 'POST',
      body: form,
    })

    expect(response.status).toBe(202)
    expect((await response.json()).results[0].status).toBe('accepted')
  })
})
