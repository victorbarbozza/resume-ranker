import type { PgDatabase } from 'drizzle-orm/pg-core'
import { drizzle, type PostgresJsQueryResultHKT } from 'drizzle-orm/postgres-js'
import postgres from 'postgres'

import { databaseUrl } from '@/server/config/env'
import * as schema from '@/server/shared/database/schema'

/** globalThis with a slot for the pool, kept across `next dev` reloads */
const globalForPostgres = globalThis as typeof globalThis & {
  postgresClient?: ReturnType<typeof postgres>
}

/**
 * One connection pool per process. `next dev` re-evaluates modules on every
 * change, so outside production the pool is kept on globalThis. Notices are
 * dropped: they are informational ("already exists, skipping").
 */
const client =
  globalForPostgres.postgresClient ??
  postgres(databaseUrl, { max: 5, onnotice: () => {} })
if (process.env.NODE_ENV !== 'production') {
  globalForPostgres.postgresClient = client
}

/** Drizzle client for the whole server, typed with every table */
export const db = drizzle(client, { schema })

/** The database itself or an open transaction; repositories accept either */
export type Executor = PgDatabase<PostgresJsQueryResultHKT, typeof schema>

/** Throws when the database cannot answer a trivial query */
export const checkConnection = async (): Promise<void> => {
  await client`select 1`
}

/**
 * Runs work while holding a Postgres advisory lock, so processes that share
 * the database run it one at a time. The lock lives on one reserved
 * connection and is released when the work ends, even when it throws.
 */
export const withAdvisoryLock = async <T>(
  key: number,
  work: () => Promise<T>
): Promise<T> => {
  const connection = await client.reserve()
  try {
    await connection`select pg_advisory_lock(${key})`
    return await work()
  } finally {
    await connection`select pg_advisory_unlock(${key})`
    connection.release()
  }
}
