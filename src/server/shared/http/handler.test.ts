import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { Type } from 'typebox'

import { httpHandler } from './handler'
import { HTTPError } from './http-error'

const url = 'http://localhost/api/test'

const post = (body: string) =>
  new Request(url, {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/json' },
  })

const eventSchema = Type.Object({
  body: Type.Object(
    { title: Type.String({ minLength: 1 }) },
    { additionalProperties: false }
  ),
})

describe('httpHandler', () => {
  const consoleError = spyOn(console, 'error').mockImplementation(() => {})

  afterEach(() => consoleError.mockClear())

  test('passes the validated event to the handler and answers with its result', async () => {
    const handler = httpHandler(
      async (event: { body: { title: string } }) => ({
        title: event.body.title,
      }),
      { eventSchema, successStatusCode: 201 }
    )

    const response = await handler(post('{"title":"Backend Engineer"}'))

    expect(response.status).toBe(201)
    expect(await response.json()).toEqual({ title: 'Backend Engineer' })
  })

  test('answers 400 with details when the event does not match the schema', async () => {
    const handler = httpHandler(async () => ({}), { eventSchema })

    const response = await handler(post('{"title":"","extra":true}'))
    const body = await response.json()

    expect(response.status).toBe(400)
    expect(body.error).toBe('VALIDATION_ERROR')
    expect(body.details.length).toBeGreaterThan(0)
  })

  test('answers 400 when the body is not valid JSON', async () => {
    const handler = httpHandler(async () => ({}))

    const response = await handler(post('{not json'))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('INVALID_JSON')
  })

  test('reads path and query parameters', async () => {
    const handler = httpHandler(async (event) => event)

    const response = await handler(new Request(`${url}?page=2`), {
      params: Promise.resolve({ jobId: 'job-1' }),
    })

    expect(await response.json()).toEqual({
      pathParameters: { jobId: 'job-1' },
      queryStringParameters: { page: '2' },
    })
  })

  test('maps an HTTPError to its status, code and extra data', async () => {
    const handler = httpHandler(async () => {
      throw new HTTPError('job not found', {
        statusCode: 404,
        code: 'JOB_NOT_FOUND',
        errorData: { jobId: 'job-1' },
      })
    })

    const response = await handler(new Request(url))

    expect(response.status).toBe(404)
    expect(await response.json()).toEqual({
      jobId: 'job-1',
      error: 'JOB_NOT_FOUND',
      message: 'job not found',
    })
  })

  test('hides the message of unexpected errors', async () => {
    const handler = httpHandler(async () => {
      throw new Error('connection refused at 10.0.0.5')
    })

    const response = await handler(new Request(url))

    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({
      error: 'ERR_INTERNAL',
      message: 'Internal error',
    })
    expect(consoleError).toHaveBeenCalledTimes(1)
  })

  test('sends no body for 204', async () => {
    const handler = httpHandler(async () => undefined, {
      successStatusCode: 204,
    })

    const response = await handler(new Request(url, { method: 'DELETE' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })
})
