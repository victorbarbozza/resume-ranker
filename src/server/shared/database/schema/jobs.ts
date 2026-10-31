import {
  check,
  integer,
  jsonb,
  pgTable,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  JOB_STATUSES,
  JOB_TITLE_MAX_LENGTH,
  type IJobRequirements,
  type JobStatus,
} from '@/server/shared/schemas/job.schema'
import { type Area, AREAS } from '@/shared/areas'

import {
  createdAt,
  deletedAt,
  modelColumn,
  oneOf,
  promptVersionColumn,
  updatedAt,
} from './columns'

/**
 * A job opening.
 *
 * - `area`: picked by the person from the fixed list; the first ranking filter
 * - `requirements`: extracted by the LLM from the description; null until job.analyze finishes
 * - `version`: bumped on every edit, so results computed for older text can be told apart
 */
export const jobs = pgTable(
  'jobs',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    title: varchar('title', { length: JOB_TITLE_MAX_LENGTH }).notNull(),
    description: text('description').notNull(),
    area: varchar('area', { length: 32 }).$type<Area>().notNull(),
    requirements: jsonb('requirements').$type<IJobRequirements>(),
    requirementsModel: modelColumn('requirements_model'),
    requirementsPromptVersion: promptVersionColumn(
      'requirements_prompt_version'
    ),
    status: varchar('status', { length: 16 })
      .$type<JobStatus>()
      .notNull()
      .default('pending'),
    version: integer('version').notNull().default(1),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    check('jobs_area_check', oneOf(table.area, AREAS)),
    check('jobs_status_check', oneOf(table.status, JOB_STATUSES)),
  ]
)
