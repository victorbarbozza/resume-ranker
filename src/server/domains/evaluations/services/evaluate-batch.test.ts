import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { fixedAnswerModel } from '@/server/shared/connectors/llm'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createJob,
  createReadyCandidate,
  generatedBy,
} from '@/server/test/fixtures'

import { evaluateBatch } from './evaluate-batch'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const result = (candidateId: string, score: number) => ({
  candidateId,
  strengths: ['Node.js: 6 years building APIs'],
  gaps: [],
  summary: 'Fits the job.',
  score,
})

const answering = (results: evaluationsRepo.EvaluationResult[]) =>
  fixedAnswerModel(JSON.stringify({ results }), 'test-model')

const neverCalled = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error('the LLM was called')
  },
})

const queuedBatch = async (count: number) => {
  const job = await createJob()
  await jobsRepo.saveAnalysis(
    job.id,
    1,
    { mustHave: ['Node.js'], niceToHave: [] },
    generatedBy
  )
  const ids: string[] = []
  for (let i = 0; i < count; i++) ids.push(await createReadyCandidate({}))
  await evaluationsRepo.queue(job.id, 1, ids)
  return { job, ids }
}

const statuses = async (jobId: string) =>
  (await evaluationsRepo.listByJob(jobId)).map(
    ({ candidateId, status, score }) => ({
      candidateId,
      status,
      score,
    })
  )

describe('evaluateBatch', () => {
  test('saves one score per candidate with the model and prompt that made it', async () => {
    const { job, ids } = await queuedBatch(2)

    await evaluateBatch(
      job.id,
      1,
      ids,
      answering([result(ids[0], 90), result(ids[1], 40)])
    )
    const [best] = await evaluationsRepo.listByJob(job.id)

    expect(best).toMatchObject({
      candidateId: ids[0],
      status: 'done',
      score: 90,
      generatedBy: {
        model: 'test-model',
        promptVersion: 'candidates-evaluate@2',
      },
    })
  })

  test('a missing result fails the attempt and saves nothing', async () => {
    const { job, ids } = await queuedBatch(2)

    await expect(
      evaluateBatch(job.id, 1, ids, answering([result(ids[0], 90)]))
    ).rejects.toThrow('the LLM scored 1 of the 2 candidates sent')
    expect((await statuses(job.id)).map(({ status }) => status)).toEqual([
      'queued',
      'queued',
    ])
  })

  test('ignores an unknown id and keeps the first of two results for one candidate', async () => {
    const { job, ids } = await queuedBatch(1)

    await evaluateBatch(
      job.id,
      1,
      ids,
      answering([
        result(crypto.randomUUID(), 99),
        result(ids[0], 70),
        result(ids[0], 10),
      ])
    )

    expect(await statuses(job.id)).toEqual([
      { candidateId: ids[0], status: 'done', score: 70 },
    ])
  })

  test('skips a job edited since, without calling the LLM', async () => {
    const { job, ids } = await queuedBatch(1)
    await jobsRepo.update(job.id, { title: 'Staff Engineer' })

    await evaluateBatch(job.id, 1, ids, neverCalled)
  })

  test('marks a candidate deleted since as failed and scores the rest', async () => {
    const { job, ids } = await queuedBatch(2)
    await candidatesRepo.softDelete(ids[1])

    await evaluateBatch(job.id, 1, ids, answering([result(ids[0], 80)]))
    const rows = await statuses(job.id)

    expect(rows.find(({ candidateId }) => candidateId === ids[0])?.status).toBe(
      'done'
    )
    expect(rows.find(({ candidateId }) => candidateId === ids[1])?.status).toBe(
      'failed'
    )
  })

  test('a job whose analysis failed is scored against its description alone', async () => {
    const job = await createJob()
    await jobsRepo.markAnalysisFailed(job.id, 1)
    const id = await createReadyCandidate({})
    await evaluationsRepo.queue(job.id, 1, [id])
    const model = new MockLanguageModelV4({
      doGenerate: {
        content: [
          { type: 'text', text: JSON.stringify({ results: [result(id, 50)] }) },
        ],
        finishReason: { unified: 'stop', raw: undefined },
        usage: {
          inputTokens: {
            total: 0,
            noCache: 0,
            cacheRead: undefined,
            cacheWrite: undefined,
          },
          outputTokens: { total: 0, text: 0, reasoning: undefined },
        },
        warnings: [],
      },
    })

    await evaluateBatch(job.id, 1, [id], model)

    expect(JSON.stringify(model.doGenerateCalls[0].prompt)).toContain(
      'Must have:\\n- none listed'
    )
  })
})
