import { databaseUrl } from '@/server/config/env'
import { checkConnection } from '@/server/shared/connectors/postgres'
import {
  describeDatabaseUrl,
  runMigrations,
} from '@/server/shared/database/migrate'

/** Host, port and database this step migrates, without the credentials */
const target = describeDatabaseUrl(databaseUrl)

try {
  await checkConnection()
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(
    `✗ Database unreachable at ${target} (${reason}). Start it with \`bun run dev:up\` or check DATABASE_URL.`
  )
  process.exit(1)
}
console.info(`✓ Database reachable at ${target}`)

try {
  const { applied, total } = await runMigrations()
  console.info(
    applied > 0
      ? `✓ Migrations applied: ${applied} new, ${total} in total`
      : `✓ Migrations up to date (${total} applied)`
  )
} catch (error) {
  const reason = error instanceof Error ? error.message : String(error)
  console.error(`✗ Migrations failed (${reason})`)
  process.exit(1)
}
process.exit(0)
