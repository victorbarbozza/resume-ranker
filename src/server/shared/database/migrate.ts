import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { migrationsFolder } from '@/server/config/env'
import { db, withAdvisoryLock } from '@/server/shared/connectors/postgres'

/** Advisory lock that keeps two migration runs from overlapping */
const MIGRATIONS_LOCK_KEY = 72_841_001

/** Outcome of a migration run */
export type MigrationReport = { applied: number; total: number }

/** Host, port and database of a connection URL, without the user or the password */
export const describeDatabaseUrl = (url: string): string => {
  const { hostname, port, pathname } = new URL(url)
  return `${hostname}:${port || '5432'}${pathname}`
}

/** How many migrations the database has applied; zero before the first run creates the journal */
const countApplied = async (): Promise<number> => {
  const [journal] = await db.execute<{ found: boolean }>(
    sql`select to_regclass('drizzle.__drizzle_migrations') is not null as found`
  )
  if (!journal.found) return 0

  const [row] = await db.execute<{ count: number }>(
    sql`select count(*)::int as count from drizzle.__drizzle_migrations`
  )
  return row.count
}

/**
 * Applies pending migrations and reports how many ran. Already applied ones
 * are skipped, and a run started while another is in progress waits for it.
 */
export const runMigrations = async (): Promise<MigrationReport> =>
  withAdvisoryLock(MIGRATIONS_LOCK_KEY, async () => {
    const before = await countApplied()
    await migrate(db, { migrationsFolder })
    const total = await countApplied()
    return { applied: total - before, total }
  })
