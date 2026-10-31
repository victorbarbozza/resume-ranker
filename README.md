# Resume Ranker

Rank candidates for a job opening. Register a job, upload resumes (TXT, PDF or DOCX) and get every candidate from the job's area ranked with a score, strengths and gaps.

> Work in progress. [ROADMAP.md](ROADMAP.md) lists what is done and what comes next.

## Stack

- Next.js 16 (App Router) for the UI and the API
- PostgreSQL 16 with Drizzle ORM: data, task queue and full-text search
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
bun run dev:up    # Postgres on localhost:55433
bun run dev       # http://localhost:3000
```

`curl http://localhost:3000/api/health` answers `{"status":"ok"}` when the app reaches the database.

To run the production image instead of the dev server:

```bash
docker compose up -d --build
```

## Configuration

Nothing needs to be configured to run locally: every variable has a default that matches `compose.yaml`. Set a variable in the shell to change it, for example `APP_PORT=3001 docker compose up -d`.

| Variable                              | Default                                            | Used by                        |
| ------------------------------------- | -------------------------------------------------- | ------------------------------ |
| `DATABASE_URL`                        | `postgres://dev:dev@localhost:55433/resume_ranker` | app                            |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` | `dev` / `dev`                                      | compose (Postgres and the app) |
| `POSTGRES_PORT`                       | `55433`                                            | compose: host port of Postgres |
| `APP_PORT`                            | `3000`                                             | compose: host port of the app  |

## Scripts

| Script                                      | What it does                                 |
| ------------------------------------------- | -------------------------------------------- |
| `bun run dev`                               | Next.js dev server                           |
| `bun run build`                             | Production build (standalone output)         |
| `bun run lint`                              | ESLint                                       |
| `bun run typecheck`                         | Route types, then `tsc --noEmit`             |
| `bun run test`                              | Unit tests with `bun test`                   |
| `bun run format`                            | Prettier                                     |
| `bun run db:generate`                       | Generate a migration from the Drizzle schema |
| `bun run db:migrate`                        | Apply migrations                             |
| `bun run dev:up` / `dev:down` / `dev:reset` | Start, stop or wipe local Postgres           |

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

A request flows route file → handler → service → repository or connector, and no layer is skipped. Client code may import types from `src/server`, never modules; ESLint enforces it.

## Naming

- Files and folders: kebab-case (`create-job.ts`, `job-form.tsx`)
- Components, classes and types: PascalCase (`JobForm`, `HTTPError`)
- Functions and variables: camelCase (`createJob`)
