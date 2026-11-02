import { afterEach, describe, expect, spyOn, test } from 'bun:test'
import { Type } from 'typebox'

import { httpHandler } from './handler'
import { HTTPError } from './http-error'
import { uploadedFileSchema } from './uploaded-file'

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

const noInput = { eventSchema: Type.Object({}) }

describe('httpHandler', () => {
  const consoleError = spyOn(console, 'error').mockImplementation(() => {})

  afterEach(() => consoleError.mockClear())

  test('passes the validated event to the handler and answers with its result', async () => {
    const handler = httpHandler(
      async (event) => ({ title: event.body.title }),
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
    const handler = httpHandler(async () => ({}), noInput)

    const response = await handler(post('{not json'))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('INVALID_JSON')
  })

  test('reads path and query parameters', async () => {
    const handler = httpHandler(async (event) => event, {
      eventSchema: Type.Object({
        pathParameters: Type.Object({ jobId: Type.String() }),
        queryStringParameters: Type.Object({ page: Type.String() }),
      }),
    })

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
    }, noInput)

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
    }, noInput)

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
      ...noInput,
      successStatusCode: 204,
    })

    const response = await handler(new Request(url, { method: 'DELETE' }))

    expect(response.status).toBe(204)
    expect(await response.text()).toBe('')
  })
})

describe('httpHandler with multipart', () => {
  const uploadSchema = Type.Object({
    body: Type.Object({
      files: Type.Array(uploadedFileSchema),
      note: Type.Array(Type.String()),
    }),
  })

  const upload = (form: FormData) =>
    new Request(url, { method: 'POST', body: form })

  test('reads every field as a list, and every file with its bytes', async () => {
    const form = new FormData()
    form.append(
      'files',
      new File(['first resume'], 'a.txt', { type: 'text/plain' })
    )
    form.append('files', new File(['second'], 'b.txt', { type: 'text/plain' }))
    form.append('note', 'batch one')
    const handler = httpHandler(
      async (event) => ({
        names: event.body.files.map((file) => file.name),
        sizes: event.body.files.map((file) => file.bytes.byteLength),
        note: event.body.note,
      }),
      { eventSchema: uploadSchema }
    )

    const response = await handler(upload(form))

    expect(await response.json()).toEqual({
      names: ['a.txt', 'b.txt'],
      sizes: [12, 6],
      note: ['batch one'],
    })
  })

  test('answers 400 when a field that should be a file is text', async () => {
    const form = new FormData()
    form.append('files', 'not a file')
    form.append('note', 'batch one')
    const handler = httpHandler(async () => ({}), { eventSchema: uploadSchema })

    const response = await handler(upload(form))

    expect(response.status).toBe(400)
    expect((await response.json()).error).toBe('VALIDATION_ERROR')
  })

  test('refuses a body over the limit before reading it, and one without a size', async () => {
    const handler = httpHandler(async () => ({}), {
      eventSchema: Type.Object({}),
      maxBodyBytes: 1024,
    })
    const large = new Request(url, {
      method: 'POST',
      body: 'x'.repeat(2048),
      headers: { 'Content-Length': '2048' },
    })
    const unsized = new Request(url, { method: 'POST', body: 'x' })

    const tooLarge = await handler(large)
    const noLength = await handler(unsized)

    expect(tooLarge.status).toBe(413)
    expect((await tooLarge.json()).error).toBe('PAYLOAD_TOO_LARGE')
    expect(noLength.status).toBe(411)
  })
})
