import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createUser, randomHash } from '@/server/test/fixtures'

import * as sessionsRepo from './sessions'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const hour = 60 * 60 * 1000

const createSession = async (expiresInMs: number) => {
  const user = await createUser()
  const idHash = randomHash()
  await sessionsRepo.create({
    idHash,
    userId: user.id,
    expiresAt: new Date(Date.now() + expiresInMs),
    ip: '203.0.113.7',
  })
  return { user, idHash }
}

describe('sessions repository', () => {
  test('finds the user behind an active session', async () => {
    const { user, idHash } = await createSession(hour)

    expect(await sessionsRepo.findActive(idHash)).toMatchObject({
      userId: user.id,
      username: user.username,
    })
  })

  test('ignores an expired session', async () => {
    const { idHash } = await createSession(-hour)

    expect(await sessionsRepo.findActive(idHash)).toBeUndefined()
  })

  test('removes a session on logout', async () => {
    const { idHash } = await createSession(hour)

    await sessionsRepo.remove(idHash)

    expect(await sessionsRepo.findActive(idHash)).toBeUndefined()
  })

  test('deletes only expired sessions', async () => {
    const active = await createSession(hour)
    await createSession(-hour)
    await createSession(-2 * hour)

    expect(await sessionsRepo.deleteExpired()).toBe(2)
    expect(await sessionsRepo.findActive(active.idHash)).toBeDefined()
  })
})
