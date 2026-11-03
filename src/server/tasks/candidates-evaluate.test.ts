import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createAnalyzedJob, createReadyCandidate } from '@/server/test/fixtures'

import { candidatesEvaluateHandler } from './candidates-evaluate'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const queuedTask = async () => {
  const job = await createAnalyzedJob()
  const candidateId = await createReadyCandidate({})
  await evaluationsRepo.queue(job.id, 1, [candidateId])
  const task = await tasksRepo.enqueue('candidates.evaluate', {
    jobId: job.id,
    jobVersion: 1,
    candidateId,
  })
  return { job, task }
}

describe('candidates.evaluate handler', () => {
  test('scores the candidate of a valid payload with the configured model', async () => {
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
      candidateId: 'not-an-id',
    })

    await expect(candidatesEvaluateHandler.run(task)).rejects.toThrow(
      'candidates.evaluate payload does not match its schema'
    )
  })

  test('marks the evaluation failed once the task is dead', async () => {
    const { job, task } = await queuedTask()

    await candidatesEvaluateHandler.onDead?.(task, 'provider timeout')

    expect((await evaluationsRepo.listByJob(job.id))[0].status).toBe('failed')
  })
})
