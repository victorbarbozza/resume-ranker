import { db } from '@/server/shared/connectors/postgres'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { HTTPError } from '@/server/shared/http/http-error'
import type { IJob } from '@/server/shared/schemas/job.schema'

/** The 404 every job route answers for a job that does not exist or was deleted */
const jobNotFound = () =>
  new HTTPError('job not found', { statusCode: 404, code: 'JOB_NOT_FOUND' })

/** Creates a job and queues its analysis in one transaction, so a job never waits for an analysis nobody queued */
export const createJob = async (
  input: jobsRepo.CreateJobInput
): Promise<IJob> =>
  db.transaction(async (tx) => {
    const job = await jobsRepo.create(input, tx)
    await tasksRepo.enqueue(
      'job.analyze',
      { jobId: job.id, version: job.version },
      tx
    )
    return job
  })

/** Every live job, newest first */
export const listJobs = async (): Promise<IJob[]> => jobsRepo.list()

/** A live job by id */
export const getJob = async (id: string): Promise<IJob> => {
  const job = await jobsRepo.findById(id)
  if (!job) throw jobNotFound()
  return job
}

/**
 * Applies an edit and queues the analysis of the new version in one
 * transaction. The version goes up, so results made for the old text show as
 * stale and an analysis of the old version still running is ignored.
 */
export const updateJob = async (
  id: string,
  changes: Partial<jobsRepo.CreateJobInput>
): Promise<IJob> =>
  db.transaction(async (tx) => {
    const job = await jobsRepo.update(id, changes, tx)
    if (!job) throw jobNotFound()
    await tasksRepo.enqueue(
      'job.analyze',
      { jobId: job.id, version: job.version },
      tx
    )
    return job
  })

/** Hides a job; its row and evaluations stay */
export const deleteJob = async (id: string): Promise<void> => {
  if (!(await jobsRepo.softDelete(id))) throw jobNotFound()
}

/**
 * Queues the analysis of the current version again after it failed. Answers
 * 409 while the analysis is pending or done, so a job never has two analyses
 * queued at once.
 */
export const retryAnalysis = async (id: string): Promise<IJob> =>
  db.transaction(async (tx) => {
    const job = await jobsRepo.reopenFailedAnalysis(id, tx)
    if (!job) {
      if (!(await jobsRepo.findById(id, tx))) throw jobNotFound()
      throw new HTTPError('only a failed analysis can be retried', {
        statusCode: 409,
        code: 'ANALYSIS_NOT_FAILED',
      })
    }
    await tasksRepo.enqueue(
      'job.analyze',
      { jobId: job.id, version: job.version },
      tx
    )
    return job
  })
