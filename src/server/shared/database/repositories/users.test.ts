import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'
import { createUser } from '@/server/test/fixtures'

import * as usersRepo from './users'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

describe('users repository', () => {
  test('creates a user without exposing the password hash', async () => {
    const user = await createUser('scrypt$salt$hash')

    expect(user).toEqual({
      id: expect.any(String),
      username: expect.stringMatching(/^user-/),
      createdAt: expect.any(String),
    })
    expect(await usersRepo.findById(user.id)).toEqual(user)
  })

  test('returns the hash only from the login lookup', async () => {
    const user = await createUser('scrypt$salt$hash')

    expect(await usersRepo.findByUsernameWithHash(user.username)).toEqual({
      ...user,
      passwordHash: 'scrypt$salt$hash',
    })
    expect(await usersRepo.findByUsernameWithHash('nobody')).toBeUndefined()
  })

  test('keeps usernames unique', async () => {
    const user = await createUser()

    expect(
      await usersRepo.create({ username: user.username, passwordHash: 'x' })
    ).toBeUndefined()
  })
})
