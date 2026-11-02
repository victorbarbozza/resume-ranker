import { tmpdir } from 'node:os'
import { join } from 'node:path'

/**
 * Loaded by bun test before any test file (see bunfig.toml): every test talks
 * to its own database, so a test run never touches development data, and to
 * the fake LLM, so a provider exported in the shell is never called, and to a
 * temporary folder for uploaded files.
 */
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgres://dev:dev@localhost:55433/resume_ranker_test'
process.env.LLM_MODEL = 'fake'
process.env.STORAGE_DRIVER = 'fs'
process.env.STORAGE_DIR = join(tmpdir(), 'resume-ranker-test-files')
delete process.env.LLM_RPM
