import type { LanguageModel } from 'ai'

import { generateJson } from '@/server/shared/connectors/llm'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import type { ICandidateProfile } from '@/server/shared/schemas/candidate.schema'
import type { IAssessment } from '@/server/shared/schemas/evaluation.schema'
import type { IJobRequirements } from '@/server/shared/schemas/job.schema'
import {
  type Assessments,
  evaluatePrompt,
} from '@/server/tasks/prompts/candidates-evaluate'
import { buildRequest } from '@/server/tasks/prompts/prompt'

import {
  type Criterion,
  criteriaOf,
  experienceVerdict,
  quotedFrom,
  scoreOf,
} from './scoring'

/**
 * Throws unless the answer judges every requirement sent exactly once, and
 * nothing else, so a verdict can never land on the wrong requirement.
 */
const assertEveryRequirement = (
  sent: string[],
  answer: Assessments['assessments']
) => {
  const answered = answer.map((item) => item.requirementId)
  const complete =
    answered.length === sent.length &&
    new Set(answered).size === answered.length &&
    sent.every((id) => answered.includes(id))
  if (!complete) {
    throw new Error(
      `the LLM answered requirements ${answered.join(', ') || 'none'} for ${sent.join(', ')}`
    )
  }
}

/**
 * The assessment of one criterion. The code judges the experience from the
 * profile. A requirement the LLM judged keeps its verdict only when its quote
 * is in the resume; a quote the resume does not have makes it missing.
 */
const assess = (
  criterion: Criterion,
  requirements: IJobRequirements,
  profile: ICandidateProfile,
  resumeText: string,
  answer: Assessments['assessments']
): IAssessment => {
  const { id, group, weight, requirement } = criterion
  if (requirement === null) {
    return {
      criterion: id,
      group,
      weight,
      requirement,
      verdict: experienceVerdict(requirements.experience, profile),
      evidence: null,
      evidenceNotFound: false,
      experience: {
        ...requirements.experience,
        years: profile.yearsOfExperience,
        candidateSeniority: profile.seniority,
      },
    }
  }
  const judged = answer.find((item) => item.requirementId === id)
  const evidence = judged?.evidence ?? null
  const shown = judged !== undefined && judged.verdict !== 'missing'
  const found = evidence !== null && quotedFrom(evidence, resumeText)
  return {
    criterion: id,
    group,
    weight,
    requirement,
    verdict: shown && found ? judged.verdict : 'missing',
    evidence,
    evidenceNotFound: shown && !found,
    experience: null,
  }
}

/**
 * Checks one candidate against one job version and saves the result with the
 * model and prompt that produced it. The LLM reads the whole resume and gives
 * a verdict and a quote for each requirement; the code checks every quote,
 * judges the experience and computes the score. Does nothing when the job
 * was deleted or edited since: the result would already be stale. A
 * candidate deleted or no longer ready since, or a job with no requirements,
 * is marked failed.
 * Only the worker imports this, so the web server never loads the LLM SDK.
 *
 * `model` is for tests; the worker uses the model LLM_MODEL picks.
 */
export const evaluateCandidate = async (
  jobId: string,
  jobVersion: number,
  candidateId: string,
  model?: LanguageModel
): Promise<void> => {
  const job = await jobsRepo.findById(jobId)
  if (!job || job.version !== jobVersion) return

  const [candidate] = await candidatesRepo.findReadyByIds([candidateId])
  const resumeText = candidate
    ? await candidatesRepo.findResumeText(candidateId)
    : null
  if (!candidate?.profile || !resumeText || !job.requirements) {
    await evaluationsRepo.markFailed(jobId, jobVersion, [candidateId])
    return
  }
  const { profile } = candidate
  const { requirements } = job

  const criteria = criteriaOf(requirements)
  const judged = criteria.flatMap(({ id, requirement }) =>
    requirement === null ? [] : [{ id, text: requirement }]
  )
  const { output, model: modelName } = await generateJson(
    buildRequest(evaluatePrompt, {
      job: { title: job.title, description: job.description },
      requirements: judged,
      resumeText,
    }),
    model
  )
  assertEveryRequirement(
    judged.map(({ id }) => id),
    output.assessments
  )

  const assessments = criteria.map((criterion) =>
    assess(criterion, requirements, profile, resumeText, output.assessments)
  )
  await evaluationsRepo.saveResult(
    jobId,
    jobVersion,
    candidateId,
    { model: modelName, promptVersion: evaluatePrompt.version },
    { score: scoreOf(assessments), summary: output.summary, assessments }
  )
}
