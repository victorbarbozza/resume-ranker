# Resume Ranker

Rank candidates for a job opening. Register a job, upload resumes (TXT, PDF or DOCX) and get every candidate from the job's area ranked with a score, strengths and gaps.

> Work in progress. [ROADMAP.md](ROADMAP.md) lists what is done and what comes next.

## Stack

- Next.js 16 (App Router) for the UI and the API
- PostgreSQL 16 with Drizzle ORM: data and task queue
- TypeBox for request and LLM output schemas
- Vercel AI SDK for the LLM: Azure OpenAI, Ollama, or a fake model that needs no key
- TanStack Query on the client
- Bun for packages, scripts and tests

## Requirements

- Bun 1.3
- Node 24 (see `.nvmrc`)
- Docker

## Running locally

```bash
bun install
bun run dev       # starts Postgres in Docker, then http://localhost:3000
```

`bun run dev` runs the deploy steps on your machine, in the order compose runs them on the server: check Docker, start Postgres and wait until it is healthy, apply pending migrations, start the web server and the worker with live reload, then wait for `/api/health`. Each step prints its name, each process prints its name in front of every log line, and a failed step stops the ones after it. Ctrl+C stops the app; Postgres keeps running until `bun run dev:down`.

To run the production image instead, the same way the server does:

```bash
docker compose up -d --build --wait
```

Both follow the same steps:

| Step       | `bun run dev`                              | `docker compose up` (local and on the server)                |
| ---------- | ------------------------------------------ | ------------------------------------------------------------ |
| Database   | `docker compose up -d --wait postgres`     | `postgres` service, healthy                                  |
| Migrations | `bun src/migrate.ts`                       | `migrate` service: `node migrate.mjs`, the same file bundled |
| App        | `next dev` and `bun --watch src/worker.ts` | `app` (`node server.js`) and `worker` (`node worker.mjs`)    |
| Health     | waits for `GET /api/health`                | `app` health check, which `--wait` waits for                 |

The web server and the worker never change the schema: they start only after the migration step exits successfully.

## Configuration

Nothing needs to be configured to run locally: every variable has a default that matches `compose.yaml`. Set a variable in the shell to change it, for example `APP_PORT=3001 docker compose up -d`.

| Variable                                | Default                                                 | Used by                                                                          |
| --------------------------------------- | ------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `DATABASE_URL`                          | `postgres://dev:dev@localhost:55433/resume_ranker`      | app                                                                              |
| `POSTGRES_USER` / `POSTGRES_PASSWORD`   | `dev` / `dev`                                           | compose (Postgres and the app)                                                   |
| `POSTGRES_PORT`                         | `55433`                                                 | compose: host port of Postgres                                                   |
| `APP_PORT`                              | `3000`                                                  | compose: host port of the app                                                    |
| `TEST_DATABASE_URL`                     | `postgres://dev:dev@localhost:55433/resume_ranker_test` | tests (must end in `_test`)                                                      |
| `LLM_MODEL`                             | `fake`                                                  | worker: `<provider>:<model>`, such as `azure:my-deployment` or `ollama:llama3.2` |
| `LLM_RPM`                               | `10` for azure, `30` for ollama                         | worker: LLM calls per minute                                                     |
| `AZURE_RESOURCE_NAME` / `AZURE_API_KEY` | none                                                    | worker, with an `azure:` model                                                   |
| `OLLAMA_BASE_URL`                       | `http://localhost:11434/v1`                             | worker, with an `ollama:` model                                                  |

### Using a real LLM

The default `fake` model is not an LLM: it answers every prompt at once with placeholder values that match its schema, so the app and its tests run with no key, no GPU and no network. The worker warns when it is on. To rank for real, export the model and its key in the shell that starts the app; they are read at run time and never written to a file:

```bash
export LLM_MODEL=azure:my-deployment AZURE_RESOURCE_NAME=my-resource AZURE_API_KEY=...
bun run dev
```

`LLM_MODEL=ollama:llama3.2` runs a local model instead. The worker checks the variables when it starts and refuses to start, naming what is missing. Compose passes the same variables to the worker container; from there, an Ollama running on the host is `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`. Tests always use `fake`.

Each provider is one entry in `src/server/shared/connectors/llm/config.ts`: the package that talks to it, the variables it needs and its default pace. Adding a provider is a package and an entry; no task changes.

## Scripts

| Script                                      | What it does                                        |
| ------------------------------------------- | --------------------------------------------------- |
| `bun run dev`                               | Runs the deploy steps locally, with live reload     |
| `bun run build`                             | Production build (standalone output)                |
| `bun run lint`                              | ESLint                                              |
| `bun run typecheck`                         | Route types, then `tsc --noEmit`                    |
| `bun run test`                              | Unit and integration tests (needs `bun run dev:up`) |
| `bun run format`                            | Prettier                                            |
| `bun run db:generate`                       | Generate a migration from the Drizzle schema        |
| `bun run db:migrate`                        | Apply pending migrations (the step before the app)  |
| `bun run dev:up` / `dev:down` / `dev:reset` | Start, stop or wipe local Postgres                  |

## Project layout

```
src/
  app/            pages and thin route.ts files
  components/     UI components
  hooks/          React Query hooks
  services/       client-side API calls
  lib/            client helpers
  server/
    config/       environment variables
    domains/      per domain: handlers (validation) and services (rules)
    shared/       database, queue, connectors, HTTP wrapper
    tasks/        one handler per task type; prompts/ holds one prompt per type
  migrate.ts      migration step, run before the app
  worker.ts       entry of the queue worker
```

A request flows route file → handler → service → repository or connector, and no layer is skipped. Client code may import types from `src/server`, never modules; ESLint enforces it. Code that both sides run, such as the list of areas, lives in `src/shared`.

## Tests

Unit tests sit next to the code they cover. Repository tests are integration tests: they run against a separate `resume_ranker_test` database in the same Postgres, which the suite creates and migrates on its own and empties before each test. The suite refuses any database whose name does not end in `_test`. Tests never call a real LLM: they use the AI SDK's mock model, and every built prompt has a snapshot, so a prompt change shows up in the pull request diff.

## Naming

- Files and folders: kebab-case (`create-job.ts`, `job-form.tsx`)
- Components, classes and types: PascalCase (`JobForm`, `HTTPError`)
- Functions and variables: camelCase (`createJob`)

## Comments

- Every top-level declaration in `src` has a JSDoc: functions, components, constants, types, tables and schemas. ESLint enforces it.
- Properties carry no JSDoc. What a column or field needs explained goes in the JSDoc of its table or schema, as a list.
- No inline `//` comments, and no JSDoc in tests: test names describe them.
