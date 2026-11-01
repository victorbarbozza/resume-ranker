import { sql } from 'drizzle-orm'
import {
  char,
  check,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  CANDIDATE_NAME_MAX_LENGTH,
  CANDIDATE_STATUSES,
  type CandidateStatus,
  FILE_NAME_MAX_LENGTH,
  type ICandidateProfile,
} from '@/server/shared/schemas/candidate.schema'
import { type Area, AREAS } from '@/shared/areas'

import {
  createdAt,
  deletedAt,
  modelColumn,
  oneOf,
  promptVersionColumn,
  subsetOf,
  updatedAt,
} from './columns'

/**
 * One resume in the shared base.
 *
 * - `contentHash`: sha256 of the uploaded file, computed in the browser; unique among live candidates, so uploads are idempotent and a deleted candidate does not block a new upload
 * - `resumeText`: stored whole and read only by the LLM tasks; truncation only happens when a prompt is built
 * - `areas`: one or two areas extracted by the LLM; a ranking reads the candidates of the job's area
 */
export const candidates = pgTable(
  'candidates',
  {
    id: uuid('id')
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    name: varchar('name', { length: CANDIDATE_NAME_MAX_LENGTH }),
    fileName: varchar('file_name', { length: FILE_NAME_MAX_LENGTH }).notNull(),
    contentHash: char('content_hash', { length: 64 }).notNull(),
    resumeText: text('resume_text').notNull(),
    profile: jsonb('profile').$type<ICandidateProfile>(),
    profileModel: modelColumn('profile_model'),
    profilePromptVersion: promptVersionColumn('profile_prompt_version'),
    areas: text('areas')
      .array()
      .$type<Area[]>()
      .notNull()
      .default(sql`'{}'::text[]`),
    status: varchar('status', { length: 16 })
      .$type<CandidateStatus>()
      .notNull()
      .default('pending'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    deletedAt: deletedAt(),
  },
  (table) => [
    uniqueIndex('candidates_content_hash_key')
      .on(table.contentHash)
      .where(sql`${table.deletedAt} is null`),
    index('idx_candidates_areas').using('gin', table.areas),
    check('candidates_status_check', oneOf(table.status, CANDIDATE_STATUSES)),
    check('candidates_areas_check', subsetOf(table.areas, AREAS)),
  ]
)
