import { APICallError } from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import { describe, expect, test } from 'bun:test'
import { Type } from 'typebox'

import { RetryLaterError } from '@/server/shared/queue/retry-later-error'

import { fixedAnswerModel, generateJson, waitForTurn } from './index'

const request = {
  system: 'Extract the requirements.',
  prompt: '<job>Backend engineer</job>',
  schema: Type.Object(
    {
      mustHave: Type.Array(Type.String()),
      seniority: Type.Union([Type.Literal('junior'), Type.Literal('senior')]),
    },
    { additionalProperties: false }
  ),
}

const failingModel = (statusCode: number, headers: Record<string, string>) =>
  new MockLanguageModelV4({
    doGenerate: async () => {
      throw new APICallError({
        message: `status ${statusCode}`,
        url: 'https://llm.test/v1/responses',
        requestBodyValues: {},
        statusCode,
        responseHeaders: headers,
      })
    },
  })

describe('generateJson', () => {
  test('returns the validated answer and the model that gave it', async () => {
    const answer = { mustHave: ['Node.js'], seniority: 'senior' as const }

    const result = await generateJson(
      request,
      fixedAnswerModel(JSON.stringify(answer), 'test-model')
    )

    expect(result).toEqual({ output: answer, model: 'test-model' })
  })

  test('sends the instructions and the data apart', async () => {
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          { type: 'text', text: '{"mustHave":[],"seniority":"junior"}' },
        ],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: 0,
            noCache: 0,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      },
    })

    await generateJson(request, model)
    const [call] = model.doGenerateCalls

    expect(call.prompt[0]).toEqual({
      role: 'system',
      content: 'Extract the requirements.',
    })
    expect(JSON.stringify(call.prompt[1])).toContain(
      '<job>Backend engineer</job>'
    )
    expect(call.responseFormat?.type).toBe('json')
  })

  test('rejects an answer that does not match the schema', async () => {
    const answer = { mustHave: ['Node.js'], seniority: 'principal' }

    await expect(
      generateJson(request, fixedAnswerModel(JSON.stringify(answer)))
    ).rejects.toThrow()
  })

  test('rejects an answer that is not JSON', async () => {
    await expect(
      generateJson(request, fixedAnswerModel('Sure! Here are the requirements'))
    ).rejects.toThrow()
  })

  test('a 429 postpones the task for as long as the provider asks', async () => {
    await expect(
      generateJson(request, failingModel(429, { 'retry-after': '7' }))
    ).rejects.toMatchObject({ name: 'RetryLaterError', delayMs: 7_000 })
    await expect(
      generateJson(request, failingModel(429, { 'retry-after-ms': '1500' }))
    ).rejects.toMatchObject({ delayMs: 1_500 })
    await expect(
      generateJson(request, failingModel(429, {}))
    ).rejects.toMatchObject({ delayMs: 60_000 })
  })

  test('any other provider error fails the attempt', async () => {
    const error = await generateJson(request, failingModel(500, {})).catch(
      (failure: unknown) => failure
    )

    expect(error).toBeInstanceOf(APICallError)
    expect(error).not.toBeInstanceOf(RetryLaterError)
  })

  test('the fake provider answers placeholder values that match the schema', async () => {
    const result = await generateJson(request)

    expect(result).toEqual({
      output: { mustHave: [], seniority: 'junior' },
      model: 'fake',
    })
  })
})

describe('waitForTurn', () => {
  test('keeps calls at least the gap apart', async () => {
    await waitForTurn(0)
    const start = Date.now()

    await waitForTurn(150)

    expect(Date.now() - start).toBeGreaterThanOrEqual(140)
  })
})
