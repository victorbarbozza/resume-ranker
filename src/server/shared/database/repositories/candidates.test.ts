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

  test('keeps the resume text out of the candidate object', async () => {
    const candidate = await createCandidate({ resumeText: 'Full resume text' })

    expect(candidate).not.toHaveProperty('resumeText')
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

    await expect(createCandidate({ contentHash })).rejects.toThrow()

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

    expect((await candidatesRepo.list()).map((c) => c.id)).toEqual([kept.id])
    expect(await candidatesRepo.findById(deleted.id)).toBeUndefined()
    expect(await candidatesRepo.setStatus(deleted.id, 'failed')).toBe(false)
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
