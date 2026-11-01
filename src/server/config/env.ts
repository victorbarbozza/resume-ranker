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
