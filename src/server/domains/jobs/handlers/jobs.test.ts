import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'
import { eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import * as jobsRepo from '@/server/shared/database/repositories/jobs'
import { tasks } from '@/server/shared/database/schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createJob, generatedBy } from '@/server/test/fixtures'

import { handler as postJob } from './create-job'
import { handler as deleteJob } from './delete-job'
import { handler as getJob } from './get-job'
import { handler as listJobs } from './list-jobs'
import { handler as retryAnalysis } from './retry-job-analysis'
import { handler as patchJob } from './update-job'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const url = 'http://localhost/api/jobs'

const send = (method: string, body?: unknown) =>
  new Request(url, {
    method,
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  })

const withId = (id: string) => ({ params: Promise.resolve({ id }) })

const analysisTasks = () =>
  db.select().from(tasks).where(eq(tasks.type, 'job.analyze'))

const newJob = {
  title: 'Backend Engineer',
  description: 'Node.js and PostgreSQL required.',
  area: 'engineering',
}

describe('POST /api/jobs', () => {
  test('stores a pending job and queues its analysis', async () => {
    const response = await postJob(send('POST', newJob))
    const job = await response.json()

    expect(response.status).toBe(201)
    expect(job).toMatchObject({ ...newJob, status: 'pending', version: 1 })
    expect((await analysisTasks()).map((task) => task.payload)).toEqual([
      { jobId: job.id, version: 1 },
    ])
  })

  test('rejects a missing title, an unknown area and an extra field', async () => {
    const invalid = [
      { ...newJob, title: '' },
      { ...newJob, area: 'astrology' },
      { ...newJob, salary: 10_000 },
    ]

    for (const body of invalid) {
      const response = await postJob(send('POST', body))
      expect(response.status).toBe(400)
      expect((await response.json()).error).toBe('VALIDATION_ERROR')
    }
    expect(await analysisTasks()).toHaveLength(0)
  })
})

describe('GET /api/jobs', () => {
  test('lists live jobs, newest first', async () => {
    await createJob({ title: 'Older' })
    await createJob({ title: 'Newer' })
    const deleted = await createJob({ title: 'Deleted' })
    await jobsRepo.softDelete(deleted.id)

    const response = await listJobs(send('GET'))
    const { jobs } = await response.json()

    expect(jobs.map((job: { title: string }) => job.title)).toEqual([
      'Newer',
      'Older',
    ])
  })
})

describe('GET /api/jobs/:id', () => {
  test('answers the job, 404 for an unknown one and 400 for an id that is not a uuid', async () => {
    const job = await createJob()

    const found = await getJob(send('GET'), withId(job.id))
    const missing = await getJob(send('GET'), withId(crypto.randomUUID()))
    const invalid = await getJob(send('GET'), withId('42'))

    expect(await found.json()).toEqual(job)
    expect(missing.status).toBe(404)
    expect((await missing.json()).error).toBe('JOB_NOT_FOUND')
    expect(invalid.status).toBe(400)
  })
})

describe('PATCH /api/jobs/:id', () => {
  test('bumps the version, clears the analysis and queues the new version', async () => {
    const job = await createJob()
    await jobsRepo.saveAnalysis(
      job.id,
      1,
      { mustHave: ['Node.js'], niceToHave: [] },
      generatedBy
    )

    const response = await patchJob(
      send('PATCH', { title: 'Staff Engineer' }),
      withId(job.id)
    )

    expect(await response.json()).toMatchObject({
      title: 'Staff Engineer',
      version: 2,
      status: 'pending',
      requirements: null,
    })
    expect((await analysisTasks()).map((task) => task.payload)).toEqual([
      { jobId: job.id, version: 2 },
    ])
  })

  test('rejects an empty edit and answers 404 for an unknown job', async () => {
    const job = await createJob()

    const empty = await patchJob(send('PATCH', {}), withId(job.id))
    const missing = await patchJob(
      send('PATCH', { title: 'Staff Engineer' }),
      withId(crypto.randomUUID())
    )

    expect(empty.status).toBe(400)
    expect(missing.status).toBe(404)
    expect(await analysisTasks()).toHaveLength(0)
  })
})

describe('DELETE /api/jobs/:id', () => {
  test('hides the job, and a second delete answers 404', async () => {
    const job = await createJob()

    const first = await deleteJob(send('DELETE'), withId(job.id))
    const second = await deleteJob(send('DELETE'), withId(job.id))
    const read = await getJob(send('GET'), withId(job.id))

    expect(first.status).toBe(204)
    expect(second.status).toBe(404)
    expect(read.status).toBe(404)
  })
})

describe('POST /api/jobs/:id/analyze', () => {
  test('queues a failed analysis again', async () => {
    const job = await createJob()
    await jobsRepo.markAnalysisFailed(job.id, 1)

    const response = await retryAnalysis(send('POST'), withId(job.id))

    expect(response.status).toBe(202)
    expect((await response.json()).status).toBe('pending')
    expect(await analysisTasks()).toHaveLength(1)
  })

  test('answers 409 while the analysis has not failed, and 404 for an unknown job', async () => {
    const job = await createJob()

    const pending = await retryAnalysis(send('POST'), withId(job.id))
    const missing = await retryAnalysis(
      send('POST'),
      withId(crypto.randomUUID())
    )

    expect(pending.status).toBe(409)
    expect((await pending.json()).error).toBe('ANALYSIS_NOT_FAILED')
    expect(missing.status).toBe(404)
    expect(await analysisTasks()).toHaveLength(0)
  })
})
