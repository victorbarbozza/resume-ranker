import { randomBytes } from 'node:crypto'

import { databaseUrl } from '@/server/config/env'
import { hashPassword } from '@/server/domains/auth/services/passwords'
import { describeDatabaseUrl } from '@/server/shared/database/migrate'
import * as usersRepo from '@/server/shared/database/repositories/users'
import {
  type IUser,
  USERNAME_MAX_LENGTH,
} from '@/server/shared/schemas/user.schema'

/**
 * Creates a user with a random password and prints the password once; the only
 * way to create users. Here it is `bun run user:create <username>`; on a
 * deploy, `docker compose exec app node create-user.mjs <username>` runs it
 * inside the app container, against the database of that deploy.
 */
const username = process.argv[2] ?? ''
if (
  !/^[A-Za-z0-9._-]+$/.test(username) ||
  username.length > USERNAME_MAX_LENGTH
) {
  console.error(
    `✗ Usage: bun run user:create <username>, with letters, digits, dots, dashes or underscores, up to ${USERNAME_MAX_LENGTH}`
  )
  process.exit(1)
}

/** 24 random characters, shown once and stored only as a hash */
const password = randomBytes(18).toString('base64url')
/** The new user; undefined when the username is taken */
let user: IUser | undefined
try {
  user = await usersRepo.create({
    username,
    passwordHash: await hashPassword(password),
  })
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(
    `✗ Could not create the user at ${describeDatabaseUrl(databaseUrl)} (${reason})`
  )
  process.exit(1)
}
if (!user) {
  console.error(`✗ ${username} already exists`)
  process.exit(1)
}

console.info(`✓ Created ${username}`)
console.info(`  Password, shown only now: ${password}`)
process.exit(0)
