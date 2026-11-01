import { sql } from 'drizzle-orm'
import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { databaseUrl, migrationsFolder } from '@/server/config/env'
import { checkConnection, db } from '@/server/shared/connectors/postgres'

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

/** Applies pending migrations and reports how many ran; already applied ones are skipped, so it is safe on every boot */
export const runMigrations = async (): Promise<MigrationReport> => {
  const before = await countApplied()
  await migrate(db, { migrationsFolder })
  const total = await countApplied()
  return { applied: total - before, total }
}

/**
 * Checks the database and applies pending migrations, logging both steps so
 * every server start shows whether the database is ready. Throws when the
 * database cannot be reached.
 */
export const prepareDatabase = async (): Promise<void> => {
  const target = describeDatabaseUrl(databaseUrl)

  try {
    await checkConnection()
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    console.error(
      `✗ Database unreachable at ${target} (${reason}). Start it with \`bun run dev:up\` or check DATABASE_URL.`
    )
    throw error
  }
  console.info(`✓ Database reachable at ${target}`)

  const { applied, total } = await runMigrations()
  console.info(
    applied > 0
      ? `✓ Migrations applied: ${applied} new, ${total} in total`
      : `✓ Migrations up to date (${total} applied)`
  )
}
