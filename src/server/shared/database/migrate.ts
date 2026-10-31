import { migrate } from 'drizzle-orm/postgres-js/migrator'

import { migrationsFolder } from '@/server/config/env'
import { db } from '@/server/shared/connectors/postgres'

/** Applies pending migrations; already applied ones are skipped, so it is safe on every boot */
export const runMigrations = async (): Promise<void> => {
  await migrate(db, { migrationsFolder })
}
