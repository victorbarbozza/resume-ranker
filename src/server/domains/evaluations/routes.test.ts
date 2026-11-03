import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'
import { Value } from 'typebox/value'

import { api } from '@/server/api'
import { db } from '@/server/shared/connectors/postgres'
import * as candidatesRepo from '@/server/shared/database/repositories/candidates'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import * as tasksRepo from '@/server/shared/database/repositories/tasks'
import { tasks } from '@/server/shared/database/schema'
import { runTask } from '@/server/shared/queue/worker'
import { candidatesEvaluatePayloadSchema } from '@/server/shared/schemas/task.schema'
import { handlers } from '@/server/tasks/handlers'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createAnalyzedJob,
  createJob,
  createReadyCandidate,
  requirementsWith,
  signedInHeaders,
} from '@/server/test/fixtures'

let signedIn: Record<string, string>

beforeAll(prepareTestDatabase)
beforeEach(async () => {
  await resetDatabase()
  signedIn = await signedInHeaders()
})

const rank = (jobId: string, body: unknown) =>
  api.request(`/api/jobs/${jobId}/evaluations`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { ...signedIn, 'Content-Type': 'application/json' },
  })

const ranking = async (jobId: string) =>
  (
    await api.request(`/api/jobs/${jobId}/evaluations`, { headers: signedIn })
  ).json()

const evaluateTasks = () =>
  db.select().from(tasks).where(eq(tasks.type, 'candidates.evaluate'))

const readyJob = () => createAnalyzedJob()

const runQueuedTasks = async () => {
  for (
    let task = await tasksRepo.claimNext();
    task;
    task = await tasksRepo.claimNext()
  ) {
    await runTask(task, handlers)
  }
}

describe('POST /api/jobs/:id/evaluations', () => {
  test('queues every ready candidate of the area, one task each', async () => {
    const job = await readyJob()
    for (let i = 0; i < 7; i++) await createReadyCandidate({})
    await createReadyCandidate({ areas: ['data'] })

    const response = await rank(job.id, { scope: 'area' })

    expect(response.status).toBe(202)
    expect(await response.json()).toEqual({
      queued: 7,
      alreadyCurrent: 0,
      skipped: [],
      leftOut: 0,
    })
    const queued = (await evaluateTasks()).map(
      (task) =>
        Value.Parse(candidatesEvaluatePayloadSchema, task.payload).candidateId
    )
    expect(new Set(queued).size).toBe(7)
  })

  test('says how many the limit of 50 left out', async () => {
    const job = await readyJob()
    for (let i = 0; i < 52; i++) await createReadyCandidate({})

    const summary = await (await rank(job.id, { scope: 'area' })).json()

    expect(summary).toMatchObject({ queued: 50, leftOut: 2 })
  })

  test('does not queue again a candidate with a current result', async () => {
    const job = await readyJob()
    await createReadyCandidate({})
    await rank(job.id, { scope: 'area' })

    const again = await (await rank(job.id, { scope: 'area' })).json()

    expect(again).toMatchObject({ queued: 0, alreadyCurrent: 1 })
    expect(await evaluateTasks()).toHaveLength(1)
  })

  test('ranks hand-picked candidates and reports the ones that are not ready', async () => {
    const job = await readyJob()
    const ready = await createReadyCandidate({ areas: ['data'] })
    const unknown = crypto.randomUUID()

    const summary = await (
      await rank(job.id, { scope: 'selected', candidateIds: [ready, unknown] })
    ).json()

    expect(summary).toMatchObject({ queued: 1, skipped: [unknown] })
  })

  test('answers 409 while the job is being analysed, or when it has no requirements to check', async () => {
    const pending = await createJob()
    const failed = await createJob()
    await jobsRepo.markAnalysisFailed(failed.id, 1)
    const empty = await createAnalyzedJob(requirementsWith([]))
    await createReadyCandidate({})

    const whilePending = await rank(pending.id, { scope: 'area' })
    const afterFailure = await rank(failed.id, { scope: 'area' })
    const withoutRequirements = await rank(empty.id, { scope: 'area' })

    expect(whilePending.status).toBe(409)
    expect((await whilePending.json()).error).toBe('JOB_NOT_ANALYZED')
    expect((await afterFailure.json()).error).toBe('JOB_HAS_NO_REQUIREMENTS')
    expect((await withoutRequirements.json()).error).toBe(
      'JOB_HAS_NO_REQUIREMENTS'
    )
    expect(await evaluateTasks()).toEqual([])
  })

  test('answers 404 for an unknown job and 400 for an unknown scope', async () => {
    const job = await readyJob()

    const missing = await rank(crypto.randomUUID(), { scope: 'area' })
    const invalid = await rank(job.id, { scope: 'everyone' })

    expect(missing.status).toBe(404)
    expect(invalid.status).toBe(400)
  })
})

describe('GET /api/jobs/:id/evaluations', () => {
  test('shows progress, then every score once the worker ran', async () => {
    const job = await readyJob()
    await createReadyCandidate({})
    await createReadyCandidate({})
    await rank(job.id, { scope: 'area' })

    const queued = await ranking(job.id)
    await runQueuedTasks()
    const done = await ranking(job.id)

    expect(queued.progress).toEqual({ queued: 2, done: 0, failed: 0 })
    expect(done.progress).toEqual({ queued: 0, done: 2, failed: 0 })
    expect(done.evaluations[0]).toMatchObject({
      status: 'done',
      score: 0,
      stale: false,
      otherArea: false,
      generatedBy: { model: 'fake', promptVersion: 'candidates-evaluate@3' },
    })
  })

  test('marks results of an older job version as stale and other areas as such', async () => {
    const job = await readyJob()
    const other = await createReadyCandidate({ areas: ['data'] })
    await rank(job.id, { scope: 'selected', candidateIds: [other] })
    await runQueuedTasks()
    await jobsRepo.update(job.id, { title: 'Staff Engineer' })

    const { evaluations } = await ranking(job.id)

    expect(evaluations[0]).toMatchObject({ stale: true, otherArea: true })
  })

  test('hides deleted candidates', async () => {
    const job = await readyJob()
    const deleted = await createReadyCandidate({})
    await rank(job.id, { scope: 'area' })
    await candidatesRepo.softDelete(deleted)

    expect((await ranking(job.id)).evaluations).toEqual([])
  })
})
