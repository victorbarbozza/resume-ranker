import { afterAll, beforeAll, beforeEach, expect, spyOn, test } from 'bun:test'

import * as rateLimitsRepo from '@/server/shared/database/repositories/rate-limits'
import * as sessionsRepo from '@/server/shared/database/repositories/sessions'
import * as usersRepo from '@/server/shared/database/repositories/users'
import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { randomHash } from '@/server/test/fixtures'

import { runMaintenance } from './maintenance'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const info = spyOn(console, 'info').mockImplementation(() => {})
afterAll(() => info.mockRestore())

const hour = 60 * 60_000

test('deletes old rate-limit windows and expired sessions, and keeps the rest', async () => {
  await rateLimitsRepo.increment('login:a', new Date(Date.now() - 2 * hour))
  await rateLimitsRepo.increment('login:a', new Date())
  const user = await usersRepo.create({
    username: 'recruiter',
    passwordHash: 'scrypt$salt$hash',
  })
  const active = randomHash()
  for (const [idHash, expiresInMs] of [
    [active, hour],
    [randomHash(), -hour],
  ] as const) {
    await sessionsRepo.create({
      idHash,
      userId: user.id,
      expiresAt: new Date(Date.now() + expiresInMs),
      ip: null,
    })
  }

  expect(await runMaintenance()).toEqual({ windows: 1, sessions: 1 })
  expect(await sessionsRepo.findActive(active)).toBeDefined()
})
