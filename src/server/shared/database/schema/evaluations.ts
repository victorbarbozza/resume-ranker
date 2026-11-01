import { sql } from 'drizzle-orm'
import {
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core'

import {
  EVALUATION_STATUSES,
  type EvaluationStatus,
} from '@/server/shared/schemas/evaluation.schema'

import { candidates } from './candidates'
import {
  createdAt,
  modelColumn,
  oneOf,
  promptVersionColumn,
  updatedAt,
} from './columns'
import { jobs } from './jobs'

/** The link between a job and a candidate: one current result per pair */
export const evaluations = pgTable(
  'evaluations',
  {
    jobId: uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),
    candidateId: uuid('candidate_id')
      .notNull()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    jobVersion: integer('job_version').notNull(),
    status: varchar('status', { length: 16 })
      .$type<EvaluationStatus>()
      .notNull()
      .default('queued'),
    score: smallint('score'),
    summary: text('summary'),
    strengths: jsonb('strengths').$type<string[]>().notNull().default([]),
    gaps: jsonb('gaps').$type<string[]>().notNull().default([]),
    model: modelColumn('model'),
    promptVersion: promptVersionColumn('prompt_version'),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    primaryKey({
      name: 'evaluations_pkey',
      columns: [table.jobId, table.candidateId],
    }),
    index('idx_evaluations_candidate_id').on(table.candidateId),
    check('evaluations_status_check', oneOf(table.status, EVALUATION_STATUSES)),
    check('evaluations_score_check', sql`${table.score} between 0 and 100`),
  ]
)
