import type { LanguageModel } from 'ai'

import { generateJson } from '@/server/shared/connectors/llm'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import { jobAnalyzePrompt } from '@/server/tasks/prompts/job-analyze'
import { buildRequest } from '@/server/tasks/prompts/prompt'

/**
 * Extracts the requirements of one version of a job and stores them with the
 * model and prompt that produced them. Does nothing when the job was deleted
 * or edited since: a newer task analyses the newer version. Kept apart from
 * the API services so the web server never loads the LLM SDK.
 *
 * `model` is for tests; the worker uses the model LLM_MODEL picks.
 */
export const analyzeJob = async (
  jobId: string,
  version: number,
  model?: LanguageModel
): Promise<void> => {
  const job = await jobsRepo.findById(jobId)
  if (!job || job.version !== version) return

  const { output, model: modelName } = await generateJson(
    buildRequest(jobAnalyzePrompt, job),
    model
  )
  await jobsRepo.saveAnalysis(jobId, version, output, {
    model: modelName,
    promptVersion: jobAnalyzePrompt.version,
  })
}
