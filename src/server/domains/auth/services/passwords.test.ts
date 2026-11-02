import { describe, expect, test } from 'bun:test'

import { hashPassword, verifyPassword } from './passwords'

describe('passwords', () => {
  test('verifies the password a hash was made from, and no other', async () => {
    const hash = await hashPassword('correct horse battery staple')

    expect(hash).toMatch(/^scrypt\$16384\$8\$5\$/)
    expect(await verifyPassword('correct horse battery staple', hash)).toBe(
      true
    )
    expect(await verifyPassword('correct horse battery', hash)).toBe(false)
  })

  test('salts every hash', async () => {
    expect(await hashPassword('same password')).not.toBe(
      await hashPassword('same password')
    )
  })

  test('answers false for a username that has no hash', async () => {
    expect(await verifyPassword('any password', undefined)).toBe(false)
  })
})
