import {
  integer,
  pgTable,
  primaryKey,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

/**
 * Fixed-window counters: one row per key and window, deleted once the window ends.
 *
 * - `key`: what is limited and for whom, e.g. login:203.0.113.7
 */
export const rateLimits = pgTable(
  'rate_limits',
  {
    key: varchar('key', { length: 128 }).notNull(),
    windowStart: timestamp('window_start', { withTimezone: true }).notNull(),
    count: integer('count').notNull().default(0),
  },
  (table) => [
    primaryKey({
      name: 'rate_limits_pkey',
      columns: [table.key, table.windowStart],
    }),
  ]
)
