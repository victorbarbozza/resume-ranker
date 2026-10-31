// Every environment variable the server reads, in one place.
// Defaults match compose.yaml, so a fresh clone runs with no configuration.

export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://dev:dev@localhost:55433/resume_ranker'
