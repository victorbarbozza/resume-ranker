import { createAnthropic } from '@ai-sdk/anthropic'
import { createAzure } from '@ai-sdk/azure'
import { createOpenAICompatible } from '@ai-sdk/openai-compatible'
import type { LanguageModel } from 'ai'

import { ollamaBaseUrl } from '@/server/config/env'

/** Every real provider, by the name LLM_MODEL starts with */
export const LLM_PROVIDER_NAMES = ['azure', 'anthropic', 'ollama'] as const
/** One of LLM_PROVIDER_NAMES */
export type LlmProviderName = (typeof LLM_PROVIDER_NAMES)[number]

/**
 * How the connector reaches one provider.
 *
 * - `requires`: variables the provider's SDK reads on each call; the worker refuses to start without them
 * - `model`: the model with the id that follows the provider in LLM_MODEL
 */
export type LlmProviderConfig = {
  requires: string[]
  model: (id: string) => LanguageModel
}

/** Every real provider; adding one is a package and an entry here */
export const LLM_PROVIDERS: Record<LlmProviderName, LlmProviderConfig> = {
  azure: {
    requires: ['AZURE_RESOURCE_NAME', 'AZURE_API_KEY'],
    model: (deployment) => createAzure()(deployment),
  },
  anthropic: {
    requires: ['ANTHROPIC_API_KEY'],
    model: (name) => createAnthropic()(name),
  },
  ollama: {
    requires: [],
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
 */
export type LlmSettings = {
  provider: 'fake' | LlmProviderName
  modelId: string
}

/**
 * Checks LLM_MODEL and the variables the provider needs. Throws an
 * error that names what is wrong, so the worker refuses to start instead of
 * failing on its first task.
 */
export const parseLlmSettings = (
  model: string,
  variables: Record<string, string | undefined>
): LlmSettings => {
  if (model === 'fake') return { provider: 'fake', modelId: 'fake' }

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

  return { provider, modelId }
}
