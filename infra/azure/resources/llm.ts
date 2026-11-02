import * as cognitiveservices from '@pulumi/azure-native/cognitiveservices'
import * as pulumi from '@pulumi/pulumi'

import type { Settings } from './settings'

/** What the app needs to call the model: `LLM_MODEL=azure:<deployment>`, the resource and its key, kept encrypted in the stack */
export type Llm = {
  resourceName: pulumi.Output<string>
  deploymentName: pulumi.Output<string>
  key: pulumi.Output<string>
}

/** An Azure OpenAI resource with one model deployment, billed per token from the subscription's credits */
export const createLlm = (
  resourceGroupName: pulumi.Input<string>,
  accountName: pulumi.Input<string>,
  settings: Settings
): Llm => {
  const account = new cognitiveservices.Account('openai', {
    resourceGroupName,
    accountName,
    location: settings.openaiLocation,
    kind: 'OpenAI',
    sku: { name: 'S0' },
    properties: {
      customSubDomainName: accountName,
      publicNetworkAccess: cognitiveservices.PublicNetworkAccess.Enabled,
    },
  })
  const deployment = new cognitiveservices.Deployment('model', {
    resourceGroupName,
    accountName: account.name,
    deploymentName: settings.openaiModel,
    properties: {
      model: {
        format: 'OpenAI',
        name: settings.openaiModel,
        version: settings.openaiModelVersion,
      },
    },
    sku: { name: 'GlobalStandard', capacity: settings.openaiCapacity },
  })
  const key = pulumi.secret(
    cognitiveservices
      .listAccountKeysOutput({ resourceGroupName, accountName: account.name })
      .apply((keys) => {
        if (!keys.key1) {
          throw new Error(
            'Azure OpenAI returned no key: is local auth disabled?'
          )
        }
        return keys.key1
      })
  )
  return { resourceName: account.name, deploymentName: deployment.name, key }
}
