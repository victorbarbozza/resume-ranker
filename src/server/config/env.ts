import { DEFAULT_RANKING_MAX_CANDIDATES } from '@/shared/limits'

/** Defaults to the Postgres in compose.yaml, so a fresh clone runs with no configuration */
export const databaseUrl =
  process.env.DATABASE_URL ?? 'postgres://dev:dev@localhost:55433/resume_ranker'

/** Relative to the working directory; the Docker image sets an absolute path */
export const migrationsFolder =
  process.env.MIGRATIONS_FOLDER ?? 'src/server/shared/database/migrations'

/**
 * LLM_MODEL: which model answers, as `<provider>:<model>`, such as
 * `azure:my-deployment` or `ollama:llama3.2`. `fake` by default, which needs
 * no key. Read at run time only; each provider's SDK reads its own key.
 */
export const llmModel = process.env.LLM_MODEL ?? 'fake'

/** LLM_RPM: LLM calls per minute; each provider has a default */
export const llmRpm = process.env.LLM_RPM

/** OLLAMA_BASE_URL: the local Ollama by default */
export const ollamaBaseUrl =
  process.env.OLLAMA_BASE_URL ?? 'http://localhost:11434/v1'

/** STORAGE_DRIVER: where uploaded files live, `fs` (a folder) or `azure` (Azure Blob); `fs` by default */
export const storageDriver = process.env.STORAGE_DRIVER ?? 'fs'

/** STORAGE_DIR: the folder of the `fs` driver; relative to the working directory, the image sets an absolute path */
export const storageDir = process.env.STORAGE_DIR ?? 'data/files'

/** PORT: the port of the HTTP server */
export const port = Number(process.env.PORT ?? 3000)

/** WEB_DIR: the folder of the built screen, which the server serves next to the API; unset in development, where Vite serves it */
export const webDir = process.env.WEB_DIR

/** RANKING_MAX_CANDIDATES: most candidates one ranking sends to the LLM; a whole area takes the newest first */
export const rankingMaxCandidates = Number(
  process.env.RANKING_MAX_CANDIDATES ?? DEFAULT_RANKING_MAX_CANDIDATES
)
