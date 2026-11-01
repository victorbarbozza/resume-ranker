# Resume Ranker

Rank candidates for a job opening. Register a job, upload resumes (TXT, PDF or DOCX) and get every candidate from the job's area ranked with a score, strengths and gaps.

> Work in progress. [ROADMAP.md](ROADMAP.md) lists what is done and what comes next.

## Stack

- Next.js 16 (App Router) for the UI and the API
- PostgreSQL 16 with Drizzle ORM: data and task queue
- TypeBox for request and LLM output schemas
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

`bun run dev` checks that Docker is running, starts Postgres and waits until it is healthy, then runs every app process with its name in front of each log line. The server logs that it reached the database and applied any pending migrations. Ctrl+C stops the app; Postgres keeps running until `bun run dev:down`. `curl http://localhost:3000/api/health` answers `{"status":"ok"}` while the database is up.

To run the production image instead of the dev server:

```bash
docker compose up -d --build
```

## Configuration

Nothing needs to be configured to run locally: every variable has a default that matches `compose.yaml`. Set a variable in the shell to change it, for example `APP_PORT=3001 docker compose up -d`.

| Variable                              | Default                                                 | Used by                        |
| ------------------------------------- | ------------------------------------------------------- | ------------------------------ |
| `DATABASE_URL`                        | `postgres://dev:dev@localhost:55433/resume_ranker`      | app                            |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `dev` / `dev`                                           | compose (Postgres and the app) |
| `POSTGRES_PORT`                       | `55433`                                                 | compose: host port of Postgres |
| `APP_PORT`                            | `3000`                                                  | compose: host port of the app  |
| `TEST_DATABASE_URL`                   | `postgres://dev:dev@localhost:55433/resume_ranker_test` | tests (must end in `_test`)    |

## Scripts

| Script                                      | What it does                                                |
| ------------------------------------------- | ----------------------------------------------------------- |
| `bun run dev`                               | Checks Docker, starts Postgres, then runs the app processes |
| `bun run build`                             | Production build (standalone output)                        |
| `bun run lint`                              | ESLint                                                      |
| `bun run typecheck`                         | Route types, then `tsc --noEmit`                            |
| `bun run test`                              | Unit and integration tests (needs `bun run dev:up`)         |
| `bun run format`                            | Prettier                                                    |
| `bun run db:generate`                       | Generate a migration from the Drizzle schema                |
| `bun run db:migrate`                        | Apply migrations                                            |
| `bun run dev:up` / `dev:down` / `dev:reset` | Start, stop or wipe local Postgres                          |

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
    shared/       database, connectors, HTTP wrapper
```

A request flows route file → handler → service → repository or connector, and no layer is skipped. Client code may import types from `src/server`, never modules; ESLint enforces it. Code that both sides run, such as the list of areas, lives in `src/shared`.

## Tests

Unit tests sit next to the code they cover. Repository tests are integration tests: they run against a separate `resume_ranker_test` database in the same Postgres, which the suite creates and migrates on its own and empties before each test. The suite refuses any database whose name does not end in `_test`.

## Naming

- Files and folders: kebab-case (`create-job.ts`, `job-form.tsx`)
- Components, classes and types: PascalCase (`JobForm`, `HTTPError`)
- Functions and variables: camelCase (`createJob`)

## Comments

- Every top-level declaration in `src` has a JSDoc: functions, components, constants, types, tables and schemas. ESLint enforces it.
- Properties carry no JSDoc. What a column or field needs explained goes in the JSDoc of its table or schema, as a list.
- No inline `//` comments, and no JSDoc in tests: test names describe them.
