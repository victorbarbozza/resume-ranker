import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createJob,
  createReadyCandidate,
  generatedBy,
} from '@/server/test/fixtures'

import { candidatesEvaluateHandler } from './candidates-evaluate'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const queuedTask = async () => {
  const job = await createJob()
  await jobsRepo.saveAnalysis(
    job.id,
    1,
    { mustHave: ['Node.js'], niceToHave: [] },
    generatedBy
  )
  const candidateId = await createReadyCandidate({})
  await evaluationsRepo.queue(job.id, 1, [candidateId])
  const task = await tasksRepo.enqueue('candidates.evaluate', {
    jobId: job.id,
    jobVersion: 1,
    candidateIds: [candidateId],
  })
  return { job, task }
}

describe('candidates.evaluate handler', () => {
  test('scores the batch of a valid payload with the configured model', async () => {
    const { job, task } = await queuedTask()

    await candidatesEvaluateHandler.run(task)

    expect((await evaluationsRepo.listByJob(job.id))[0]).toMatchObject({
      status: 'done',
      score: 0,
      generatedBy: { model: 'fake' },
    })
  })

  test('rejects a payload that does not match its schema', async () => {
    const task = await tasksRepo.enqueue('candidates.evaluate', {
      jobId: crypto.randomUUID(),
      jobVersion: 1,
      candidateIds: [],
    })

    await expect(candidatesEvaluateHandler.run(task)).rejects.toThrow(
      'candidates.evaluate payload does not match its schema'
    )
  })

  test('marks the batch failed once the task is dead', async () => {
    const { job, task } = await queuedTask()

    await candidatesEvaluateHandler.onDead?.(task, 'provider timeout')

    expect((await evaluationsRepo.listByJob(job.id))[0].status).toBe('failed')
  })
})
