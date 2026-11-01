import { sql } from 'drizzle-orm'
import postgres from 'postgres'

import { databaseUrl } from '@/server/config/env'
import { db } from '@/server/shared/connectors/postgres'
import { runMigrations } from '@/server/shared/database/migrate'

/** Every table, emptied before each test */
const tables = [
  'evaluations',
  'resume_files',
  'sessions',
  'tasks',
  'rate_limits',
  'candidates',
  'jobs',
  'users',
]

/** Throws unless the database name ends in _test, so tests never wipe real data */
const assertTestDatabase = (name: string) => {
  if (!name.endsWith('_test')) {
    throw new Error(
      `refusing to use "${name}" in tests: its name must end in _test`
    )
  }
}

/** Creates the test database when it is missing and applies every migration */
export const prepareTestDatabase = async (): Promise<void> => {
  const url = new URL(databaseUrl)
  const name = decodeURIComponent(url.pathname.slice(1))
  assertTestDatabase(name)

  url.pathname = '/postgres'
  const admin = postgres(url.toString(), { max: 1, onnotice: () => {} })
  try {
    const existing =
      await admin`select 1 from pg_database where datname = ${name}`
    if (existing.length === 0) await admin.unsafe(`create database "${name}"`)
  } finally {
    await admin.end()
  }

  await runMigrations()
}

/** Empties every table, so each test starts from a clean database */
export const resetDatabase = async (): Promise<void> => {
  const [row] = await db.execute<{ name: string }>(
    sql`select current_database() as name`
  )
  assertTestDatabase(row.name)
  await db.execute(sql.raw(`truncate table ${tables.join(', ')} cascade`))
}
