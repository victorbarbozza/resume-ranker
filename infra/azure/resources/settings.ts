import * as pulumi from '@pulumi/pulumi'

import type { Domain } from './domain'

/**
 * Everything the stack can be told.
 *
 * - `openaiLocation`: Azure OpenAI region, apart from the app's, since models reach some regions first
 * - `openaiModel` / `openaiModelVersion`: the model the deployment serves
 * - `openaiCapacity`: thousands of tokens per minute the deployment may take
 * - `domain`: from `customDomain` and `customDomainCertificate`, the app's own hostname; none when they are not set
 * - `budgetAmount` / `budgetStart`: monthly budget in USD and the first month it covers (first day of a month)
 * - `image`: from `IMAGE`, the image the app and the migration job are created with; each release replaces it
 * - `budgetEmail`: from `BUDGET_EMAIL`, where the budget alerts go; no budget without it
 */
export type Settings = {
  openaiLocation: string
  openaiModel: string
  openaiModelVersion: string
  openaiCapacity: number
  domain: Domain | undefined
  budgetAmount: number
  budgetStart: string
  image: string
  budgetEmail: string | undefined
}

/** The custom domain, when the stack names one */
const readDomain = (config: pulumi.Config): Domain | undefined => {
  const name = config.get('customDomain')
  const certificate = config.get('customDomainCertificate')
  return name && certificate ? { name, certificate } : undefined
}

/** Reads Pulumi.<stack>.yaml and the shell; values that would leak into a public repo come only from the shell */
export const readSettings = (): Settings => {
  const config = new pulumi.Config()
  return {
    openaiLocation: config.require('openaiLocation'),
    openaiModel: config.require('openaiModel'),
    openaiModelVersion: config.require('openaiModelVersion'),
    openaiCapacity: config.requireNumber('openaiCapacity'),
    domain: readDomain(config),
    budgetAmount: config.requireNumber('budgetAmount'),
    budgetStart: config.require('budgetStart'),
    image: process.env.IMAGE ?? 'ghcr.io/victorbarbozza/resume-ranker:latest',
    budgetEmail: process.env.BUDGET_EMAIL,
  }
}
