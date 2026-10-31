import { beforeAll, beforeEach, describe, expect, test } from 'bun:test'

import { prepareTestDatabase, resetDatabase } from '@/server/test/database'

import * as usersRepo from './users'

beforeAll(prepareTestDatabase)
beforeEach(resetDatabase)

const input = { username: 'recruiter', passwordHash: 'scrypt$salt$hash' }

describe('users repository', () => {
  test('creates a user without exposing the password hash', async () => {
    const user = await usersRepo.create(input)

    expect(user).toEqual({
      id: expect.any(String),
      username: 'recruiter',
      createdAt: expect.any(String),
    })
    expect(await usersRepo.findById(user.id)).toEqual(user)
  })

  test('returns the hash only from the login lookup', async () => {
    const user = await usersRepo.create(input)

    expect(await usersRepo.findByUsernameWithHash('recruiter')).toEqual({
      ...user,
      passwordHash: 'scrypt$salt$hash',
    })
    expect(await usersRepo.findByUsernameWithHash('nobody')).toBeUndefined()
  })

  test('keeps usernames unique', async () => {
    await usersRepo.create(input)

    await expect(usersRepo.create(input)).rejects.toThrow()
  })
})
