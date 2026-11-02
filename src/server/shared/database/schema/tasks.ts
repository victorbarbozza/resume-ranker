import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  RECURRING_TASK_TYPES,
  TASK_STATUSES,
  TASK_TYPES,
  type TaskStatus,
  type TaskType,
} from '@/server/shared/schemas/task.schema'

import { createdAt, oneOf, updatedAt } from './columns'

/**
 * The work queue. A task is inserted in the same transaction as the row it
 * refers to; a partial index on run_at serves the claim query, which only reads
 * queued tasks, and a partial unique index keeps at most one pending task of
 * each recurring type.
 *
 * - `runAt`: not claimed before this moment; retries and rate limits push it forward
 */
export const tasks = pgTable(
  'tasks',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    type: varchar('type', { length: 64 }).$type<TaskType>().notNull(),
    payload: jsonb('payload').notNull(),
    status: varchar('status', { length: 16 })
      .$type<TaskStatus>()
      .notNull()
      .default('queued'),
    attempts: integer('attempts').notNull().default(0),
    runAt: timestamp('run_at', { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp('locked_at', { withTimezone: true }),
    lastError: text('last_error'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    index('idx_tasks_queued_run_at')
      .on(table.runAt)
      .where(sql`${table.status} = 'queued'`),
    uniqueIndex('tasks_one_pending_recurring')
      .on(table.type)
      .where(
        sql`${oneOf(table.status, ['queued', 'running'])} and ${oneOf(table.type, RECURRING_TASK_TYPES)}`
      ),
    check('tasks_type_check', oneOf(table.type, TASK_TYPES)),
    check('tasks_status_check', oneOf(table.status, TASK_STATUSES)),
  ]
)
