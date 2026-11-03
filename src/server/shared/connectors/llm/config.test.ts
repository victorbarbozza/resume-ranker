import { describe, expect, test } from 'bun:test'

import { parseLlmSettings } from './config'

const azureKeys = { AZURE_RESOURCE_NAME: 'my-resource', AZURE_API_KEY: 'key' }

describe('parseLlmSettings', () => {
  test('the fake model needs nothing', () => {
    expect(parseLlmSettings('fake', {})).toEqual({
      provider: 'fake',
      modelId: 'fake',
    })
  })

  test('reads the provider and the model from LLM_MODEL', () => {
    expect(parseLlmSettings('azure:my-deployment', azureKeys)).toEqual({
      provider: 'azure',
      modelId: 'my-deployment',
    })
  })

  test('reads an anthropic model, which needs its API key', () => {
    expect(
      parseLlmSettings('anthropic:claude-opus-5-5', {
        ANTHROPIC_API_KEY: 'key',
      })
    ).toEqual({ provider: 'anthropic', modelId: 'claude-opus-5-5' })
    expect(() => parseLlmSettings('anthropic:claude-opus-5-5', {})).toThrow(
      'LLM_MODEL=anthropic:claude-opus-5-5 needs ANTHROPIC_API_KEY'
    )
  })

  test('keeps a model id that has its own colon', () => {
    expect(parseLlmSettings('ollama:llama3.2:3b', {})).toEqual({
      provider: 'ollama',
      modelId: 'llama3.2:3b',
    })
  })

  test('names every variable the provider needs and is missing', () => {
    expect(() => parseLlmSettings('azure:my-deployment', {})).toThrow(
      'LLM_MODEL=azure:my-deployment needs AZURE_RESOURCE_NAME, AZURE_API_KEY'
    )
  })

  test('rejects an unknown provider and a missing model id', () => {
    expect(() => parseLlmSettings('gpt:4o', {})).toThrow(
      'LLM_MODEL must be fake or <provider>:<model> with provider azure or anthropic or ollama'
    )
    expect(() => parseLlmSettings('azure', azureKeys)).toThrow(
      'LLM_MODEL must be fake or <provider>:<model>'
    )
  })
})
