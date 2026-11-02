import { sql } from 'drizzle-orm'
import { check, integer, pgTable, uuid, varchar } from 'drizzle-orm/pg-core'

import { RESUME_FILE_MAX_BYTES } from '@/server/shared/schemas/candidate.schema'

import { candidates } from './candidates'
import { createdAt } from './columns'

/**
 * Where the original upload lives. The bytes are in the file storage, under
 * a key made from their sha256; the database keeps only the key.
 */
export const resumeFiles = pgTable(
  'resume_files',
  {
    candidateId: uuid('candidate_id')
      .primaryKey()
      .references(() => candidates.id, { onDelete: 'cascade' }),
    storageKey: varchar('storage_key', { length: 100 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    createdAt: createdAt(),
  },
  (table) => [
    check(
      'resume_files_size_check',
      sql`${table.sizeBytes} between 1 and ${sql.raw(String(RESUME_FILE_MAX_BYTES))}`
    ),
  ]
)
