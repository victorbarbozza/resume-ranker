import type { LanguageModel } from 'ai'

import { generateJson } from '@/server/shared/connectors/llm'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import { evaluatePrompt } from '@/server/tasks/prompts/candidates-evaluate'
import { buildRequest } from '@/server/tasks/prompts/prompt'

/**
 * Scores one batch of candidates against one job version and saves each
 * result with the model and prompt that produced it. Does nothing when the
 * job was deleted or edited since: its results would already be stale. A
 * candidate deleted or no longer ready since is marked failed; every other
 * one sent must come back with exactly one result, or the attempt fails.
 * Only the worker imports this, so the web server never loads the LLM SDK.
 *
 * `model` is for tests; the worker uses the model LLM_MODEL picks.
 */
export const evaluateBatch = async (
  jobId: string,
  jobVersion: number,
  candidateIds: string[],
  model?: LanguageModel
): Promise<void> => {
  const job = await jobsRepo.findById(jobId)
  if (!job || job.version !== jobVersion) return

  const candidates = (
    await candidatesRepo.findReadyByIds(candidateIds)
  ).flatMap(({ id, profile }) => (profile ? [{ id, profile }] : []))
  const sent = new Set(candidates.map(({ id }) => id))
  await evaluationsRepo.markFailed(
    jobId,
    jobVersion,
    candidateIds.filter((id) => !sent.has(id))
  )
  if (candidates.length === 0) return

  const { output, model: modelName } = await generateJson(
    buildRequest(evaluatePrompt, {
      job: {
        title: job.title,
        description: job.description,
        requirements: job.requirements ?? { mustHave: [], niceToHave: [] },
      },
      candidates,
    }),
    model
  )

  const results = new Map<string, evaluationsRepo.EvaluationResult>()
  for (const result of output.results) {
    if (sent.has(result.candidateId) && !results.has(result.candidateId)) {
      results.set(result.candidateId, result)
    }
  }
  if (results.size < sent.size) {
    throw new Error(
      `the LLM scored ${results.size} of the ${sent.size} candidates sent`
    )
  }
  await evaluationsRepo.saveResults(
    jobId,
    jobVersion,
    { model: modelName, promptVersion: evaluatePrompt.version },
    [...results.values()]
  )
}
