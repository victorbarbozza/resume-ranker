import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { fixedAnswerModel } from '@/server/shared/connectors/llm'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createJob } from '@/server/test/fixtures'

import { analyzeJob } from './analyze-job'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const requirements = {
  mustHave: ['Node.js', 'PostgreSQL'],
  niceToHave: ['Kafka'],
}

const answering = (answer: unknown) =>
  fixedAnswerModel(JSON.stringify(answer), 'test-model')

const neverCalled = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error('the LLM was called')
  },
})

describe('analyzeJob', () => {
  test('stores the requirements with the model and prompt that made them', async () => {
    const job = await createJob()

    await analyzeJob(job.id, 1, answering(requirements))

    expect(await jobsRepo.findById(job.id)).toMatchObject({
      status: 'ready',
      requirements,
      requirementsGeneratedBy: {
        model: 'test-model',
        promptVersion: 'job-analyze@1',
      },
    })
  })

  test('skips a version that was edited since, without calling the LLM', async () => {
    const job = await createJob()
    await jobsRepo.update(job.id, { title: 'Staff Engineer' })

    await analyzeJob(job.id, 1, neverCalled)

    expect(await jobsRepo.findById(job.id)).toMatchObject({
      version: 2,
      status: 'pending',
      requirements: null,
    })
  })

  test('skips a deleted job without calling the LLM', async () => {
    const job = await createJob()
    await jobsRepo.softDelete(job.id)

    await analyzeJob(job.id, 1, neverCalled)
  })

  test('an answer that does not match the schema stores nothing', async () => {
    const job = await createJob()

    await expect(
      analyzeJob(job.id, 1, answering({ mustHave: 'Node.js' }))
    ).rejects.toThrow()
    expect((await jobsRepo.findById(job.id))?.status).toBe('pending')
  })
})
