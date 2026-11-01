/** Defaults to the Postgres in compose.yaml, so a fresh clone runs with no configuration */
export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://dev:dev@localhost:55433/resume_ranker'

/** Relative to the working directory; the Docker image sets an absolute path */
export const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ?? 'src/server/shared/database/migrations'
