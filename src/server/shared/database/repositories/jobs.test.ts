import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createJob, generatedBy } from '@/server/test/fixtures'
import type { Area } from '@/shared/areas'

import * as jobsRepo from './jobs'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const requirements = { mustHave: ['Node.js'], niceToHave: ['Kubernetes'] }

describe('jobs repository', () => {
  test('creates a pending job at version 1 with no requirements', async () => {
    const job = await createJob()

    expect(job).toMatchObject({
      area: 'engineering',
      status: 'pending',
      version: 1,
      requirements: null,
      requirementsGeneratedBy: null,
    })
    expect(await jobsRepo.findById(job.id)).toEqual(job)
  })

  test('lists live jobs, newest first', async () => {
    await createJob({ title: 'Older' })
    await createJob({ title: 'Newer' })
    const deleted = await createJob({ title: 'Deleted' })
    await jobsRepo.softDelete(deleted.id)

    const titles = (await jobsRepo.list()).map((job) => job.title)

    expect(titles).toEqual(['Newer', 'Older'])
  })

  test('saves the analysis of the current version', async () => {
    const job = await createJob()

    expect(
      await jobsRepo.saveAnalysis(job.id, 1, requirements, generatedBy)
    ).toBe(true)
    expect(await jobsRepo.findById(job.id)).toMatchObject({
      status: 'ready',
      requirements,
      requirementsGeneratedBy: generatedBy,
    })
  })

  test('an edit bumps the version and sends the job back to analysis', async () => {
    const job = await createJob()
    await jobsRepo.saveAnalysis(job.id, 1, requirements, generatedBy)

    const edited = await jobsRepo.update(job.id, { title: 'Senior Backend' })

    expect(edited).toMatchObject({
      title: 'Senior Backend',
      version: 2,
      status: 'pending',
      requirements: null,
      requirementsGeneratedBy: null,
    })
  })

  test('ignores an analysis made for an older version', async () => {
    const job = await createJob()
    await jobsRepo.update(job.id, { title: 'Edited' })

    expect(
      await jobsRepo.saveAnalysis(job.id, 1, requirements, generatedBy)
    ).toBe(false)
    expect(await jobsRepo.markAnalysisFailed(job.id, 1)).toBe(false)
    expect((await jobsRepo.findById(job.id))?.status).toBe('pending')
  })

  test('a deleted job is no longer found and cannot be edited', async () => {
    const job = await createJob()

    expect(await jobsRepo.softDelete(job.id)).toBe(true)
    expect(await jobsRepo.findById(job.id)).toBeUndefined()
    expect(await jobsRepo.update(job.id, { title: 'Ghost' })).toBeUndefined()
    expect(await jobsRepo.softDelete(job.id)).toBe(false)
  })

  test('the database rejects an unknown area', async () => {
    await expect(createJob({ area: 'astrology' as Area })).rejects.toThrow()
  })
})
