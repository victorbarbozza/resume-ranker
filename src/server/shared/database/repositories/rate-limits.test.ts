import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'

import * as rateLimitsRepo from './rate-limits'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const window = new Date('2026-10-31T12:00:00Z')
const nextWindow = new Date('2026-10-31T12:05:00Z')

describe('rate limits repository', () => {
  test('counts per key and per window', async () => {
    expect(await rateLimitsRepo.increment('login:a', window)).toBe(1)
    expect(await rateLimitsRepo.increment('login:a', window)).toBe(2)
    expect(await rateLimitsRepo.increment('login:b', window)).toBe(1)
    expect(await rateLimitsRepo.increment('login:a', nextWindow)).toBe(1)
  })

  test('never loses a count under concurrent increments', async () => {
    const counts = await Promise.all(
      Array.from({ length: 20 }, () =>
        rateLimitsRepo.increment('login:a', window)
      )
    )

    expect(counts.toSorted((a, b) => a - b)).toEqual(
      Array.from({ length: 20 }, (_, i) => i + 1)
    )
  })

  test('gives a count back, never going below zero', async () => {
    await rateLimitsRepo.increment('login:a', window)

    await rateLimitsRepo.decrement('login:a', window)
    await rateLimitsRepo.decrement('login:a', window)

    expect(await rateLimitsRepo.increment('login:a', window)).toBe(1)
  })

  test('deletes windows that started before a moment', async () => {
    await rateLimitsRepo.increment('login:a', window)
    await rateLimitsRepo.increment('login:a', nextWindow)

    expect(await rateLimitsRepo.deleteOlderThan(nextWindow)).toBe(1)
    expect(await rateLimitsRepo.increment('login:a', nextWindow)).toBe(2)
  })
})
