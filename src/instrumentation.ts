/**
 * Called by Next.js once per server start, before the first request: checks
 * the database and applies pending migrations. Skipped on the Edge runtime,
 * which has no database.
 */
export const register = async () => {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return

  const { prepareDatabase } = await import('@/server/shared/database/migrate')
  await prepareDatabase()
}
