import {
  char,
  index,
  inet,
  pgTable,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core'

import { createdAt } from './columns'
import { users } from './users'

/**
 * Signed-in sessions, one per login, expiring after 7 days.
 *
 * - `idHash`: sha256 of the cookie token; the token itself is never stored
 */
export const sessions = pgTable(
  'sessions',
  {
    idHash: char('id_hash', { length: 64 }).primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ip: inet('ip'),
    createdAt: createdAt(),
  },
  (table) => [index('idx_sessions_user_id').on(table.userId)]
)
