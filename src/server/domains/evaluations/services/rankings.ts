import { rankingMaxCandidates } from '@/server/config/env'
import { db } from '@/server/shared/connectors/postgres'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { HTTPError } from '@/server/shared/http/http-error'
import type { ICandidate } from '@/server/shared/schemas/candidate.schema'
import type { IJob } from '@/server/shared/schemas/job.schema'
import { evaluatePrompt } from '@/server/tasks/prompts/candidates-evaluate'

import { criteriaOf } from './scoring'

/** Which candidates a ranking scores: every ready one of the job's area, or the ones picked by hand */
export type RankRequest =
  { scope: 'area' } | { scope: 'selected'; candidateIds: string[] }

/**
 * What a ranking queued.
 *
 * - `alreadyCurrent`: candidates skipped because they have a result for this job version and prompt, or are queued for it
 * - `skipped`: picked ids that are not live, ready candidates
 * - `leftOut`: ready candidates of the area the limit kept out
 */
export type RankSummary = {
  queued: number
  alreadyCurrent: number
  skipped: string[]
  leftOut: number
}

/** A live job, or the 404 the ranking routes answer */
const findJob = async (jobId: string): Promise<IJob> => {
  const job = await jobsRepo.findById(jobId)
  if (!job) {
    throw new HTTPError('job not found', {
      statusCode: 404,
      code: 'JOB_NOT_FOUND',
    })
  }
  return job
}

/**
 * Queues the candidates of a ranking, one task per candidate, with their
 * evaluations and tasks in one transaction. A job still being analysed, or
 * one with no requirements to check, such as one whose analysis failed,
 * answers 409. Candidates with a current result are not sent again.
 */
export const rankJob = async (
  jobId: string,
  request: RankRequest
): Promise<RankSummary> => {
  const job = await findJob(jobId)
  if (job.status === 'pending') {
    throw new HTTPError(
      'the job is still being analysed; rank it once it is ready',
      {
        statusCode: 409,
        code: 'JOB_NOT_ANALYZED',
      }
    )
  }
  if (!job.requirements || criteriaOf(job.requirements).length === 0) {
    throw new HTTPError(
      'the job has no requirements to rank against; retry its analysis or edit the job',
      {
        statusCode: 409,
        code: 'JOB_HAS_NO_REQUIREMENTS',
      }
    )
  }

  let candidates: ICandidate[]
  let skipped: string[] = []
  let leftOut = 0
  if (request.scope === 'area') {
    candidates = await candidatesRepo.listReadyByArea(
      job.area,
      rankingMaxCandidates
    )
    leftOut =
      (await candidatesRepo.countReadyByArea(job.area)) - candidates.length
  } else {
    candidates = await candidatesRepo.findReadyByIds(request.candidateIds)
    const found = new Set(candidates.map(({ id }) => id))
    skipped = request.candidateIds.filter((id) => !found.has(id))
  }

  const current = new Set(
    await evaluationsRepo.listCurrentCandidateIds(
      job.id,
      job.version,
      evaluatePrompt.version
    )
  )
  const ids = candidates.map(({ id }) => id).filter((id) => !current.has(id))

  await db.transaction(async (tx) => {
    await evaluationsRepo.queue(job.id, job.version, ids, tx)
    for (const candidateId of ids) {
      await tasksRepo.enqueue(
        'candidates.evaluate',
        { jobId: job.id, jobVersion: job.version, candidateId },
        tx
      )
    }
  })

  return {
    queued: ids.length,
    alreadyCurrent: candidates.length - ids.length,
    skipped,
    leftOut,
  }
}

/**
 * One row of the ranking table.
 *
 * - `stale`: made for an older version of the job or of the prompt; ranking again scores it anew
 * - `otherArea`: a hand-picked candidate whose areas do not include the job's
 */
export type RankedEvaluation = evaluationsRepo.EvaluationWithCandidate & {
  stale: boolean
  otherArea: boolean
}

/** The ranking of a job: progress counts and every evaluation, best score first */
export type Ranking = {
  progress: { queued: number; done: number; failed: number }
  evaluations: RankedEvaluation[]
}

/** The ranking of a live job, as the job page shows it */
export const getRanking = async (jobId: string): Promise<Ranking> => {
  const job = await findJob(jobId)
  const rows = await evaluationsRepo.listByJobWithCandidates(job.id)

  const evaluations = rows.map((row) => ({
    ...row,
    stale:
      row.jobVersion < job.version ||
      (row.generatedBy !== null &&
        row.generatedBy.promptVersion !== evaluatePrompt.version),
    otherArea: !row.candidate.areas.includes(job.area),
  }))
  const progress = { queued: 0, done: 0, failed: 0 }
  for (const row of rows) progress[row.status] += 1
  return { progress, evaluations }
}
