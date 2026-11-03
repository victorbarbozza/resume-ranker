import { MockLanguageModelV4 } from 'ai/test'
import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { fixedAnswerModel } from '@/server/shared/connectors/llm'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as evaluationsRepo from '@/server/shared/database/repositories/evaluations'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import type { Assessments } from '@/server/tasks/prompts/candidates-evaluate'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createAnalyzedJob,
  createReadyCandidate,
  requirementsWith,
} from '@/server/test/fixtures'

import { evaluateCandidate } from './evaluate-candidate'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const answering = (assessments: Assessments['assessments']) =>
  fixedAnswerModel(
    JSON.stringify({ assessments, summary: 'Atende a vaga.' }),
    'test-model'
  )

const neverCalled = new MockLanguageModelV4({
  doGenerate: async () => {
    throw new Error('the LLM was called')
  },
})

/** A job with two must-haves, 5 years asked and one nice-to-have, and one queued candidate with 5 years */
const queued = async () => {
  const job = await createAnalyzedJob(
    requirementsWith(['Node.js', 'PostgreSQL'], ['Kafka'], {
      minYears: 5,
      seniority: null,
    })
  )
  const candidateId = await createReadyCandidate({})
  await evaluationsRepo.queue(job.id, 1, [candidateId])
  return { job, candidateId }
}

const evaluation = async (jobId: string) =>
  (await evaluationsRepo.listByJob(jobId))[0]

describe('evaluateCandidate', () => {
  test('computes the score from the verdicts and saves each one', async () => {
    const { job, candidateId } = await queued()

    await evaluateCandidate(
      job.id,
      1,
      candidateId,
      answering([
        {
          requirementId: 'm1',
          evidence: 'Node.js e PostgreSQL desde 2018',
          verdict: 'met',
        },
        {
          requirementId: 'm2',
          evidence: 'PostgreSQL desde 2018',
          verdict: 'partial',
        },
        { requirementId: 'n1', evidence: null, verdict: 'missing' },
      ])
    )
    const result = await evaluation(job.id)

    expect(result).toMatchObject({
      status: 'done',
      score: 67,
      summary: 'Atende a vaga.',
      generatedBy: {
        model: 'test-model',
        promptVersion: 'candidates-evaluate@3',
      },
    })
    expect(
      result.assessments.map(({ criterion, verdict }) => [criterion, verdict])
    ).toEqual([
      ['m1', 'met'],
      ['m2', 'partial'],
      ['experience', 'met'],
      ['n1', 'missing'],
    ])
  })

  test('a quote the resume does not have makes the requirement missing', async () => {
    const { job, candidateId } = await queued()

    await evaluateCandidate(
      job.id,
      1,
      candidateId,
      answering([
        { requirementId: 'm1', evidence: '10 anos de Node.js', verdict: 'met' },
        { requirementId: 'm2', evidence: 'PostgreSQL', verdict: 'met' },
        { requirementId: 'n1', evidence: null, verdict: 'missing' },
      ])
    )
    const [nodejs] = (await evaluation(job.id)).assessments

    expect(nodejs).toMatchObject({
      verdict: 'missing',
      evidence: '10 anos de Node.js',
      evidenceNotFound: true,
    })
  })

  test('an answer that skips or repeats a requirement fails the attempt and saves nothing', async () => {
    const { job, candidateId } = await queued()

    await expect(
      evaluateCandidate(
        job.id,
        1,
        candidateId,
        answering([
          { requirementId: 'm1', evidence: 'PostgreSQL', verdict: 'met' },
          { requirementId: 'm1', evidence: 'PostgreSQL', verdict: 'met' },
          { requirementId: 'n1', evidence: null, verdict: 'missing' },
        ])
      )
    ).rejects.toThrow('the LLM answered requirements m1, m1, n1 for m1, m2, n1')
    expect((await evaluation(job.id)).status).toBe('queued')
  })

  test('skips a job edited since, without calling the LLM', async () => {
    const { job, candidateId } = await queued()
    await jobsRepo.update(job.id, { title: 'Staff Engineer' })

    await evaluateCandidate(job.id, 1, candidateId, neverCalled)
  })

  test('marks a candidate deleted since as failed, without calling the LLM', async () => {
    const { job, candidateId } = await queued()
    await candidatesRepo.softDelete(candidateId)

    await evaluateCandidate(job.id, 1, candidateId, neverCalled)

    expect(
      (await evaluationsRepo.listByJob(job.id)).map(({ status }) => status)
    ).toEqual(['failed'])
  })
})
