import { describe, expect, test } from 'bun:test'

import { parseLlmSettings } from './config'

const azureKeys = { AZURE_RESOURCE_NAME: 'my-resource', AZURE_API_KEY: 'key' }

describe('parseLlmSettings', () => {
  test('the fake model needs nothing and has no pace', () => {
    expect(parseLlmSettings('fake', undefined, {})).toEqual({
      provider: 'fake',
      modelId: 'fake',
      rpm: null,
    })
  })

  test('reads the provider and the model from LLM_MODEL', () => {
    expect(
      parseLlmSettings('azure:my-deployment', undefined, azureKeys)
    ).toEqual({ provider: 'azure', modelId: 'my-deployment', rpm: 10 })
  })

  test('keeps a model id that has its own colon', () => {
    expect(parseLlmSettings('ollama:llama3.2:3b', undefined, {})).toEqual({
      provider: 'ollama',
      modelId: 'llama3.2:3b',
      rpm: 30,
    })
  })

  test('LLM_RPM overrides the provider default', () => {
    expect(parseLlmSettings('azure:my-deployment', '3', azureKeys).rpm).toBe(3)
  })

  test('names every variable the provider needs and is missing', () => {
    expect(() =>
      parseLlmSettings('azure:my-deployment', undefined, {})
    ).toThrow(
      'LLM_MODEL=azure:my-deployment needs AZURE_RESOURCE_NAME, AZURE_API_KEY'
    )
  })

  test('rejects an unknown provider and a missing model id', () => {
    expect(() => parseLlmSettings('gpt:4o', undefined, {})).toThrow(
      'LLM_MODEL must be fake or <provider>:<model> with provider azure or ollama'
    )
    expect(() => parseLlmSettings('azure', undefined, azureKeys)).toThrow(
      'LLM_MODEL must be fake or <provider>:<model>'
    )
  })

  test('rejects a pace that is not a positive number', () => {
    expect(() =>
      parseLlmSettings('azure:my-deployment', 'fast', azureKeys)
    ).toThrow('LLM_RPM must be a positive number, not "fast"')
    expect(() =>
      parseLlmSettings('azure:my-deployment', '0', azureKeys)
    ).toThrow()
  })
})
