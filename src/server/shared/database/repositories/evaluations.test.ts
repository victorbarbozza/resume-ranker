import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createCandidate, createJob, generatedBy } from '@/server/test/fixtures'

import * as evaluationsRepo from './evaluations'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const result = (candidateId: string, score: number) => ({
  candidateId,
  score,
  summary: 'Strong match on the backend requirements.',
  strengths: ['8 years of Node.js'],
  gaps: ['No Kubernetes'],
})

describe('evaluations repository', () => {
  test('queues candidates for a job version', async () => {
    const job = await createJob()
    const candidate = await createCandidate()

    await evaluationsRepo.queue(job.id, 1, [candidate.id])

    expect(await evaluationsRepo.listByJob(job.id)).toMatchObject([
      {
        candidateId: candidate.id,
        jobVersion: 1,
        status: 'queued',
        score: null,
      },
    ])
  })

  test('saves results and lists the best score first', async () => {
    const job = await createJob()
    const weaker = await createCandidate()
    const stronger = await createCandidate()
    await evaluationsRepo.queue(job.id, 1, [weaker.id, stronger.id])

    const saved = await evaluationsRepo.saveResults(job.id, 1, generatedBy, [
      result(weaker.id, 61),
      result(stronger.id, 92),
    ])
    const evaluations = await evaluationsRepo.listByJob(job.id)

    expect(saved).toBe(2)
    expect(evaluations.map((e) => [e.candidateId, e.score, e.status])).toEqual([
      [stronger.id, 92, 'done'],
      [weaker.id, 61, 'done'],
    ])
    expect(evaluations[0]).toMatchObject({
      generatedBy,
      strengths: ['8 years of Node.js'],
      gaps: ['No Kubernetes'],
    })
  })

  test('queueing again replaces an earlier result', async () => {
    const job = await createJob()
    const candidate = await createCandidate()
    await evaluationsRepo.queue(job.id, 1, [candidate.id])
    await evaluationsRepo.saveResults(job.id, 1, generatedBy, [
      result(candidate.id, 80),
    ])

    await evaluationsRepo.queue(job.id, 2, [candidate.id])

    expect(await evaluationsRepo.listByJob(job.id)).toMatchObject([
      { jobVersion: 2, status: 'queued', score: null, strengths: [], gaps: [] },
    ])
  })

  test('ignores results computed for an older job version', async () => {
    const job = await createJob()
    const candidate = await createCandidate()
    await evaluationsRepo.queue(job.id, 2, [candidate.id])

    const saved = await evaluationsRepo.saveResults(job.id, 1, generatedBy, [
      result(candidate.id, 75),
    ])

    expect(saved).toBe(0)
    expect((await evaluationsRepo.listByJob(job.id))[0].status).toBe('queued')
  })

  test('marks only queued evaluations as failed', async () => {
    const job = await createJob()
    const done = await createCandidate()
    const pending = await createCandidate()
    await evaluationsRepo.queue(job.id, 1, [done.id, pending.id])
    await evaluationsRepo.saveResults(job.id, 1, generatedBy, [
      result(done.id, 70),
    ])

    await evaluationsRepo.markFailed(job.id, 1, [done.id, pending.id])
    const statuses = Object.fromEntries(
      (await evaluationsRepo.listByJob(job.id)).map((e) => [
        e.candidateId,
        e.status,
      ])
    )

    expect(statuses).toEqual({ [done.id]: 'done', [pending.id]: 'failed' })
  })

  test('the database rejects a score above 100', async () => {
    const job = await createJob()
    const candidate = await createCandidate()
    await evaluationsRepo.queue(job.id, 1, [candidate.id])

    await expect(
      evaluationsRepo.saveResults(job.id, 1, generatedBy, [
        result(candidate.id, 101),
      ])
    ).rejects.toThrow()
  })
})
