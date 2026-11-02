import * as pulumi from '@pulumi/pulumi'

/**
 * Everything the stack can be told.
 *
 * - `openaiLocation`: Azure OpenAI region, apart from the app's, since models reach some regions first
 * - `openaiModel` / `openaiModelVersion`: the model the deployment serves
 * - `openaiCapacity`: thousands of tokens per minute the deployment may take
 * - `budgetAmount` / `budgetStart`: monthly budget in USD and the first month it covers (first day of a month)
 * - `image`: from `IMAGE`, the image the app and the migration job are created with; each release replaces it
 * - `budgetEmail`: from `BUDGET_EMAIL`, where the budget alerts go; no budget without it
 */
export type Settings = {
  openaiLocation: string
  openaiModel: string
  openaiModelVersion: string
  openaiCapacity: number
  budgetAmount: number
  budgetStart: string
  image: string
  budgetEmail: string | undefined
}

/** Reads Pulumi.<stack>.yaml and the shell; values that would leak into a public repo come only from the shell */
export const readSettings = (): Settings => {
  const config = new pulumi.Config()
  return {
    openaiLocation: config.require('openaiLocation'),
    openaiModel: config.require('openaiModel'),
    openaiModelVersion: config.require('openaiModelVersion'),
    openaiCapacity: config.requireNumber('openaiCapacity'),
    budgetAmount: config.requireNumber('budgetAmount'),
    budgetStart: config.require('budgetStart'),
    image: process.env.IMAGE ?? 'ghcr.io/victorbarbozza/resume-ranker:latest',
    budgetEmail: process.env.BUDGET_EMAIL,
  }
}
