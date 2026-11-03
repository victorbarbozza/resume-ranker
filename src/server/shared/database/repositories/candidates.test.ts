import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import type { ICandidateProfile } from '@/server/shared/schemas/candidate.schema'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import {
  createCandidate,
  createReadyCandidate,
  generatedBy,
  randomHash,
} from '@/server/test/fixtures'
import type { Area } from '@/shared/areas'

import * as candidatesRepo from './candidates'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const profile: ICandidateProfile = {
  skills: ['Kubernetes', 'Go'],
  yearsOfExperience: 8,
  seniority: 'senior',
  languages: ['English', 'Portuguese'],
  summary: 'Platform engineer focused on reliability.',
}

describe('candidates repository', () => {
  test('creates a pending candidate with no profile and no areas', async () => {
    const candidate = await createCandidate()

    expect(candidate).toMatchObject({
      status: 'pending',
      name: null,
      profile: null,
      areas: [],
    })
  })

  test('keeps the resume text out of the candidate object, null until it is extracted', async () => {
    const candidate = await createCandidate()

    expect(candidate).not.toHaveProperty('resumeText')
    expect(await candidatesRepo.findResumeText(candidate.id)).toBeNull()

    await candidatesRepo.saveResumeText(candidate.id, 'Full resume text')

    expect(await candidatesRepo.findResumeText(candidate.id)).toBe(
      'Full resume text'
    )
  })

  test('finds a live candidate by the hash of its file', async () => {
    const contentHash = randomHash()
    const candidate = await createCandidate({ contentHash })

    expect(await candidatesRepo.findByContentHash(contentHash)).toEqual(
      candidate
    )
    expect(await candidatesRepo.findByContentHash(randomHash())).toBeUndefined()
  })

  test('allows one live candidate per file, even after a delete', async () => {
    const contentHash = randomHash()
    const first = await createCandidate({ contentHash })

    expect(
      await candidatesRepo.create({ fileName: 'again.pdf', contentHash })
    ).toBeUndefined()

    await candidatesRepo.softDelete(first.id)
    const second = await createCandidate({ contentHash })

    expect(second.id).not.toBe(first.id)
    expect(await candidatesRepo.findByContentHash(contentHash)).toEqual(second)
  })

  test('saving the profile marks the candidate ready', async () => {
    const candidate = await createCandidate()

    await candidatesRepo.saveProfile(candidate.id, {
      generatedBy,
      name: 'R. Lima',
      profile,
      areas: ['engineering', 'data'],
    })

    expect(await candidatesRepo.findById(candidate.id)).toMatchObject({
      name: 'R. Lima',
      profile,
      profileGeneratedBy: generatedBy,
      areas: ['engineering', 'data'],
      status: 'ready',
    })
  })

  test('lists live candidates and hides deleted ones', async () => {
    const kept = await createCandidate()
    const deleted = await createCandidate()
    await candidatesRepo.softDelete(deleted.id)

    expect(
      (await candidatesRepo.listPage({}, 50)).map((candidate) => candidate.id)
    ).toEqual([kept.id])
    expect(await candidatesRepo.findById(deleted.id)).toBeUndefined()
    expect(await candidatesRepo.setStatus(deleted.id, 'failed')).toBe(false)
  })

  test('searches part of the name, in any case', async () => {
    const ana = await createReadyCandidate({ name: 'Ana Souza' })
    await createReadyCandidate({ name: 'Bruno Reis' })
    const ids = async (search: string) =>
      (await candidatesRepo.listPage({ search }, 50)).map(
        (candidate) => candidate.id
      )

    expect(await ids('souz')).toEqual([ana])
    expect(await ids('ANA')).toEqual([ana])
    expect(await ids('carla')).toEqual([])
  })

  test('filters by area and status', async () => {
    const data = await createReadyCandidate({ areas: ['data'] })
    await createReadyCandidate({ areas: ['engineering'] })
    const failed = await createCandidate()
    await candidatesRepo.setStatus(failed.id, 'failed')
    const ids = async (filters: candidatesRepo.CandidateFilters) =>
      (await candidatesRepo.listPage(filters, 50)).map(
        (candidate) => candidate.id
      )

    expect(await ids({ area: 'data' })).toEqual([data])
    expect(await ids({ status: 'failed' })).toEqual([failed.id])
    expect(await candidatesRepo.anyFailed()).toBe(true)
  })

  test('pages newest first after a cursor, without skipping or repeating', async () => {
    const created = []
    for (let index = 0; index < 5; index += 1) {
      created.push((await createCandidate()).id)
    }
    const first = await candidatesRepo.listPage({}, 2)
    const second = await candidatesRepo.listPage({ after: first[1].id }, 2)
    const third = await candidatesRepo.listPage({ after: second[1].id }, 2)

    expect(
      [...first, ...second, ...third].map((candidate) => candidate.id)
    ).toEqual(created.reverse())
    expect(await candidatesRepo.anyFailed()).toBe(false)
  })

  test('the database rejects an unknown area', async () => {
    const candidate = await createCandidate()

    await expect(
      candidatesRepo.saveProfile(candidate.id, {
        generatedBy,
        name: null,
        profile,
        areas: ['astrology' as Area],
      })
    ).rejects.toThrow()
  })
})

describe('ready candidates by area', () => {
  const ids = async (area: Area, limit = 20) =>
    (await candidatesRepo.listReadyByArea(area, limit)).map((c) => c.id)

  test('lists the ready candidates of the area, newest first', async () => {
    const older = await createReadyCandidate({})
    const newer = await createReadyCandidate({})
    await createReadyCandidate({ areas: ['design'] })

    expect(await ids('engineering')).toEqual([newer, older])
  })

  test('a candidate with two areas belongs to both', async () => {
    const hybrid = await createReadyCandidate({
      areas: ['data', 'engineering'],
    })

    expect(await ids('data')).toEqual([hybrid])
    expect(await ids('engineering')).toEqual([hybrid])
  })

  test('leaves out pending, failed and deleted candidates', async () => {
    const ready = await createReadyCandidate({})
    await createCandidate()
    const failed = await createReadyCandidate({})
    await candidatesRepo.setStatus(failed, 'failed')
    const deleted = await createReadyCandidate({})
    await candidatesRepo.softDelete(deleted)

    expect(await ids('engineering')).toEqual([ready])
    expect(await candidatesRepo.countReadyByArea('engineering')).toBe(1)
  })

  test('stops at the limit and still counts every ready candidate', async () => {
    await createReadyCandidate({})
    await createReadyCandidate({})
    await createReadyCandidate({})

    expect(await ids('engineering', 2)).toHaveLength(2)
    expect(await candidatesRepo.countReadyByArea('engineering')).toBe(3)
  })
})
