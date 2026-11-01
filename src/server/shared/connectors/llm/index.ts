import { setTimeout as sleep } from 'node:timers/promises'

import {
  APICallError,
  generateText,
  jsonSchema,
  type LanguageModel,
  Output,
} from 'ai'
import { MockLanguageModelV4 } from 'ai/test'
import type { Static, TSchema } from 'typebox'
import { Compile } from 'typebox/compile'
import { Create } from 'typebox/value'

import { llmModel, llmRpm } from '@/server/config/env'
import { RetryLaterError } from '@/server/shared/queue/retry-later-error'

import { LLM_PROVIDERS, type LlmSettings, parseLlmSettings } from './config'

/** What a task asks the LLM: instructions, the data, and the shape of the answer */
export type JsonRequest<Schema extends TSchema> = {
  system: string
  prompt: string
  schema: Schema
}

/**
 * The LLM's answer.
 *
 * - `model`: the model that answered, as the provider names it; stored with the output
 */
export type JsonResult<Output> = { output: Output; model: string }

/** The settings of this process, checked on first use */
let settings: LlmSettings | undefined

/** The checked LLM settings; throws an error that names the variable that is wrong */
export const llmSettings = (): LlmSettings => {
  settings ??= parseLlmSettings(llmModel, llmRpm, process.env)
  return settings
}

/** When the last call started; in memory, which holds because a single worker runs */
let lastCallAt = 0

/** Waits until at least `gapMs` has passed since the last call started, then takes the turn */
export const waitForTurn = async (gapMs: number): Promise<void> => {
  const wait = lastCallAt + gapMs - Date.now()
  if (wait > 0) await sleep(wait)
  lastCallAt = Date.now()
}

/** A model that always answers the same text: the fake model, and tests */
export const fixedAnswerModel = (
  text: string,
  modelId = 'fake'
): LanguageModel =>
  new MockLanguageModelV4({
    modelId,
    doGenerate: {
      content: [{ type: 'text', text }],
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

/** The model the settings point to; the fake one answers placeholder values that match the schema */
const createModel = (settings: LlmSettings, schema: TSchema): LanguageModel =>
  settings.provider === 'fake'
    ? fixedAnswerModel(JSON.stringify(Create(schema)))
    : LLM_PROVIDERS[settings.provider].model(settings.modelId)

/** How long a 429 asks to wait: `retry-after-ms`, then `retry-after` in seconds, else a minute */
const retryAfterMs = (headers: Record<string, string> | undefined): number => {
  const milliseconds = Number(headers?.['retry-after-ms'])
  if (milliseconds > 0) return milliseconds
  const seconds = Number(headers?.['retry-after'])
  if (seconds > 0) return seconds * 1000
  return 60_000
}

/**
 * Asks the LLM for JSON that matches the schema, at the provider's pace.
 *
 * The answer is validated with TypeBox; a mismatch or an answer that is not
 * JSON throws like any failure, so it spends an attempt. A 429 throws
 * RetryLaterError, which postpones the task without spending one. The SDK
 * never retries on its own: the queue does. Azure is told not to store the
 * request, since it carries resume text.
 */
export const generateJson = async <Schema extends TSchema>(
  { system, prompt, schema }: JsonRequest<Schema>,
  model: LanguageModel = createModel(llmSettings(), schema)
): Promise<JsonResult<Static<Schema>>> => {
  const validator = Compile(schema)
  const { rpm } = llmSettings()
  await waitForTurn(rpm ? 60_000 / rpm : 0)

  try {
    const result = await generateText({
      model,
      system,
      prompt,
      maxRetries: 0,
      output: Output.object({
        schema: jsonSchema<Static<Schema>>(schema, {
          validate: (value) => {
            if (validator.Check(value)) return { success: true, value }
            const [first] = validator.Errors(value)
            return {
              success: false,
              error: new Error(
                `answer does not match the schema at "${first?.instancePath}": ${first?.message}`
              ),
            }
          },
        }),
      }),
      providerOptions: { azure: { store: false } },
    })
    return { output: result.output, model: result.response.modelId }
  } catch (error) {
    if (APICallError.isInstance(error) && error.statusCode === 429) {
      throw new RetryLaterError(
        'LLM provider is rate limiting (429)',
        retryAfterMs(error.responseHeaders)
      )
    }
    throw error
  }
}
