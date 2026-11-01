/**
 * Loaded by bun test before any test file (see bunfig.toml): every test talks
 * to its own database, so a test run never touches development data.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://dev:dev@localhost:55433/resume_ranker_test'
