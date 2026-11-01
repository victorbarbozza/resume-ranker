import { createAzure } from '@ai-sdk/azure'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import { ollamaBaseUrl } from '@/server/config/env'

/** Every real provider, by the name LLM_MODEL starts with */
export const LLM_PROVIDER_NAMES = ['azure', 'ollama'] as const
/** One of LLM_PROVIDER_NAMES */
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number]

/**
 * How the connector reaches one provider.
 *
 * - `requires`: variables the provider's SDK reads on each call; the worker refuses to start without them
 * - `rpm`: calls per minute when LLM_RPM is not set
 * - `model`: the model with the id that follows the provider in LLM_MODEL
 */
export type LlmProviderConfig = {
  requires: string[]
  rpm: number
  model: (id: string) => LanguageModel
}

/** Every real provider; adding one is a package and an entry here */
export const LLM_PROVIDERS: Record<LlmProviderName, LlmProviderConfig> = {
  azure: {
    requires: ['AZURE_RESOURCE_NAME', 'AZURE_API_KEY'],
    rpm: 10,
    model: (deployment) => createAzure()(deployment),
  },
  ollama: {
    requires: [],
    rpm: 30,
    model: (name) =>
      createOpenAICompatible({
        name: 'ollama',
        baseURL: ollamaBaseUrl,
        supportsStructuredOutputs: true,
      }).chatModel(name),
  },
}

/**
 * The checked LLM settings.
 *
 * - `modelId`: the part of LLM_MODEL after the provider; `fake` for the fake model
 * - `rpm`: calls per minute the worker allows itself; null for the fake model, which is never paced
 */
export type LlmSettings = {
  provider: 'fake' | LlmProviderName
  modelId: string
  rpm: number | null
}

/**
 * Checks LLM_MODEL, LLM_RPM and the variables the provider needs. Throws an
 * error that names what is wrong, so the worker refuses to start instead of
 * failing on its first task.
 */
export const parseLlmSettings = (
  model: string,
  rpm: string | undefined,
  variables: Record<string, string | undefined>
): LlmSettings => {
  if (model === 'fake') return { provider: 'fake', modelId: 'fake', rpm: null }

  const [name, ...rest] = model.split(':')
  const modelId = rest.join(':')
  const provider = LLM_PROVIDER_NAMES.find((candidate) => candidate === name)
  if (!provider || !modelId) {
    throw new Error(
      `LLM_MODEL must be fake or <provider>:<model> with provider ${LLM_PROVIDER_NAMES.join(' or ')}, such as azure:my-deployment; got "${model}"`
    )
  }

  const missing = LLM_PROVIDERS[provider].requires.filter(
    (variable) => !variables[variable]
  )
  if (missing.length > 0) {
    throw new Error(`LLM_MODEL=${model} needs ${missing.join(', ')}`)
  }

  const callsPerMinute = rpm ? Number(rpm) : LLM_PROVIDERS[provider].rpm
  if (Number.isNaN(callsPerMinute) || callsPerMinute <= 0) {
    throw new Error(`LLM_RPM must be a positive number, not "${rpm}"`)
  }

  return { provider, modelId, rpm: callsPerMinute }
}
