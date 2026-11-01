import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createJob } from '@/server/test/fixtures'

import { jobAnalyzeHandler } from './job-analyze'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

describe('job.analyze handler', () => {
  test('analyses the job of a valid payload with the configured model', async () => {
    const job = await createJob()
    const task = await tasksRepo.enqueue('job.analyze', {
      jobId: job.id,
      version: 1,
    })

    await jobAnalyzeHandler.run(task)

    expect(await jobsRepo.findById(job.id)).toMatchObject({
      status: 'ready',
      requirements: { mustHave: [], niceToHave: [] },
      requirementsGeneratedBy: { model: 'fake' },
    })
  })

  test('rejects a payload that does not match its schema', async () => {
    const task = await tasksRepo.enqueue('job.analyze', {
      jobId: 'not-a-uuid',
      version: 1,
    })

    await expect(jobAnalyzeHandler.run(task)).rejects.toThrow(
      'job.analyze payload does not match its schema'
    )
  })

  test('marks the analysis failed once the task is dead', async () => {
    const job = await createJob()
    const task = await tasksRepo.enqueue('job.analyze', {
      jobId: job.id,
      version: 1,
    })

    await jobAnalyzeHandler.onDead?.(task, 'provider timeout')

    expect((await jobsRepo.findById(job.id))?.status).toBe('failed')
  })
})
