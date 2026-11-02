import { pgTable, text, uuid, varchar } from 'drizzle-orm/pg-core'

import { USERNAME_MAX_LENGTH } from '@/server/shared/schemas/user.schema'

import { createdAt } from './columns'

/**
 * People who can sign in, created only by the `bun run user:create` script.
 *
 * - `passwordHash`: scrypt hash with its salt; the password itself is never stored
 */
export const users = pgTable('users', {
  id: uuid('id')
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  username: varchar('username', { length: USERNAME_MAX_LENGTH })
    .notNull()
    .unique('users_username_key'),
  passwordHash: text('password_hash').notNull(),
  createdAt: createdAt(),
})
