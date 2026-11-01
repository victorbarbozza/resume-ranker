# Roadmap

Implementation plan, in order. The work goes from the core outwards: data, queue, LLM and the domain APIs first, each proven by integration tests against a real Postgres; then access control around every route; then the UI; then the deploy. Every phase ends with lint, typecheck, tests and build passing. Tick a task once it is done.

## 1. Architecture

- [x] System design, data model, task queue, security and deploy plan defined

## 2. Project base

- [x] Next.js 16 app, TypeScript strict, `@/*` alias
- [x] Prettier and ESLint (Next rules, import order, client code cannot import server modules)
- [x] Postgres 16 in `compose.yaml`, bound to localhost
- [x] Environment config in `src/server/config/env.ts`, with defaults that need no setup
- [x] Drizzle config and Postgres connector
- [x] `httpHandler` wrapper and `HTTPError`, with tests
- [x] `GET /api/health` with a database ping
- [x] Client fetch helper (`fetchJson`, `ApiError`) and React Query provider
- [x] Dockerfile (standalone output, runs on Node) and `app` service in compose
- [x] CI workflow: lint, typecheck, format, test, build
- [x] README with local setup and naming rules
- [x] `bun run dev` (`scripts/dev.ts`): checks Docker, waits for a healthy Postgres, runs every app process with prefixed logs

## 3. Database

- [x] Fixed area list (`engineering`, `data`, `design`, `product`, `marketing`, `sales`, `finance`, `people`, `operations`, `other`) as a shared constant
- [x] Tables: `jobs`, `candidates`, `resume_files`, `evaluations`, `tasks`, `users`, `sessions`, `rate_limits`
- [x] Ready candidates by area (GIN index on `areas`), newest first up to a limit, plus a count of every ready candidate in the area
- [x] Every LLM output stores the model and prompt version that produced it
- [x] First migration with `bun run db:generate`
- [x] Migrations ship in the image
- [x] One repository per table
- [x] Integration test setup: separate test database, migrations before the suite, Postgres service in CI
- [x] Repository integration tests

## 4. Queue and worker

- [x] `enqueue` inside the caller's transaction
- [x] Claim with `FOR UPDATE SKIP LOCKED`
- [x] Retries with backoff (10 s, 20 s, 40 s, 80 s) and `dead` after the 5th failure
- [x] Lock recovery: `running` for more than 5 minutes goes back to `queued`
- [x] Task settings in one map (`TASKS`: attempts, repeat interval) and one handler per task type; a task without a handler is marked dead
- [x] Settling checks the claim (attempts as a fencing token), so a recovered task is never settled twice
- [x] Migrations as their own step before the app (`src/migrate.ts`, `bun run db:migrate`), behind an advisory lock so two runs never overlap
- [x] `bun run dev` follows the deploy steps: Docker, Postgres, migrations, web and worker, health check
- [x] `migrate` service in compose: the app and the worker start only after it exits successfully
- [x] Maintenance as a recurring task (`maintenance.cleanup`, every 10 minutes) that deletes old `rate_limits` windows and expired sessions; the worker keeps exactly one run pending
- [x] `src/worker.ts` entry, bundled into the image, and added to the process list in `scripts/dev.ts`
- [x] `worker` service in compose
- [x] Integration tests: claim, concurrent claims, retry, dead, lock recovery

## 5. LLM connector

- [x] Vercel AI SDK (`ai`) behind one `generateJson(prompt, schema)` call; `LLM_MODEL=<provider>:<model>` picks the model, so switching providers is configuration
- [x] Providers in one map (package, required variables, default pace); adding one is a package and an entry
- [x] `azure` provider: `azure:<deployment>` with `AZURE_RESOURCE_NAME` and `AZURE_API_KEY`; requests are not stored by Azure
- [x] `ollama` provider for a local model, through its OpenAI-compatible API
- [x] `fake` model by default: the AI SDK mock model with placeholder answers that match each schema, no key; the worker warns when it is on
- [x] TypeBox schemas passed to the SDK as JSON Schema for structured output
- [x] Output validated with TypeBox; invalid output counts as a failed attempt
- [x] Provider 429 reschedules the task without spending an attempt, after the wait the provider asks for
- [x] Pace: at least `60 s ÷ LLM_RPM` between calls, kept in memory by the connector (one worker)
- [x] LLM settings from run-time environment variables only; the worker refuses to start when one is missing
- [x] Prompts: one file per task type in `src/server/tasks/prompts/`, each with a `PROMPT_VERSION`; bump it on every change
- [x] Snapshot test of every built prompt, so a prompt change shows up in the pull request diff
- [x] Tests with the mock model

## 6. Jobs API

- [x] `POST /api/jobs` (title, description, area) stores the job and queues `job.analyze` in one transaction
- [x] `GET /api/jobs` and `GET /api/jobs/:id`
- [x] `PATCH /api/jobs/:id` bumps `version` and queues a new analysis
- [x] `DELETE /api/jobs/:id` (soft delete)
- [x] `POST /api/jobs/:id/analyze` queues a failed analysis again; 409 while it is pending or done
- [x] A TypeBox schema for each task payload; handlers validate the payload before using it, so reading a task needs no cast
- [x] `job.analyze` handler: must-have and nice-to-have requirements; skips a deleted job or an older version without calling the LLM, and marks the job failed once the task is dead
- [x] Integration tests

## 7. Resumes API

- [ ] `POST /api/candidates` (multipart: file, text, sha256): candidate, file and task in one transaction
- [ ] Duplicate `content_hash` answers 200 with the existing candidate
- [ ] Files over 5 MB and empty text are rejected with a clear error
- [ ] `GET /api/candidates` with each status
- [ ] `POST /api/candidates/:id/retry` and `DELETE /api/candidates/:id` (soft delete)
- [ ] `candidate.extract_profile` handler: areas, skills, years, seniority, languages, summary
- [ ] Integration tests

## 8. Ranking API

- [ ] `POST /api/jobs/:id/evaluations` with `area` scope (every ready candidate of the job's area, up to `RANKING_MAX_CANDIDATES`, 50 by default) or `selected` scope, split into batches of 5; the response says how many the limit left out
- [ ] `candidates.evaluate` handler: fixed rubric, strengths with evidence, gaps
- [ ] The handler checks that every candidate sent got exactly one result; an unknown id is ignored and a missing one fails the attempt
- [ ] `fake` model gives each candidate of a batch a placeholder result (today it answers an empty batch)
- [ ] Prompt guardrails: resume text delimited as data, output validated against the schema
- [ ] `GET /api/jobs/:id/evaluations` with progress counts and stale flags (older job version or older prompt version)
- [ ] Integration tests

## 9. Access control

- [ ] Password hashing with scrypt from `node:crypto`, constant-time compare, tests
- [ ] `bun run user:create` script (the only way to create users)
- [ ] Rate limit service: reserve a slot before the password check, give it back on success, 10 failures per IP per 5 minutes, 429 with `Retry-After`, tests
- [ ] Client IP from `X-Forwarded-For`
- [ ] Sessions: random 32-byte token, sha256 stored, `HttpOnly` + `Secure` + `SameSite=Lax` cookie, 7-day expiry
- [ ] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [ ] Auth step in `httpHandler`: session required by default, so every route from earlier phases is protected at once; `auth: 'public'` for login and health
- [ ] `Origin` check on every non-GET request
- [ ] Security headers in `next.config.ts` (CSP, `frame-ancestors 'none'`, `nosniff`, referrer policy)
- [ ] Integration tests: 401 without a session, 429 after 10 failures

## 10. Frontend

- [ ] Design tokens and base components (button, field, chip, table)
- [ ] Login page; `src/proxy.ts` sends signed-out page visits to `/login`
- [ ] Jobs list, create form with an area picker, job page with status and requirements
- [ ] Candidates page: browser extraction (TXT, `pdfjs-dist`, `mammoth`), sha256, multi-file upload with per-file status and Retry
- [ ] Ranking on the job page: scope (whole area or selected), progress, table with stale and other-area chips
- [ ] Polling while work is pending

## 11. Deploy (Azure)

- [ ] Budget alert on the subscription
- [ ] Production compose: Caddy with an sslip.io hostname, app port not published
- [ ] Pulumi project: resource group, network, NSG for 22/80/443, static IP, B1s VM
- [ ] cloud-init: Docker, 2 GB swap, firewall
- [ ] `infra.yml`: `pulumi preview` on PRs, `pulumi up` on main, OIDC login
- [ ] `deploy.yml`: build amd64 and arm64 images, push to GHCR, `compose pull && up -d --wait` over ssh (Postgres, migrations, app and worker, health check: the steps of `bun run dev`)
- [ ] GitHub secrets: LLM API key, database password, ssh key

## 12. Backups

- [ ] Nightly `pg_dump` to object storage, keeping 7 copies
- [ ] Restore drill documented and tested

## Improvements (after v1)

- [ ] Re-extract profiles after the profile prompt changes: one LLM call per resume, started from the candidates page
- [ ] Cheap pre-filter before the LLM once the base reaches thousands of resumes: embeddings (`pgvector`) or keywords pick the top candidates of the area, and only those are scored
- [ ] Editable job requirements: `PATCH /api/jobs/:id/requirements`, `requirements_source` column so re-analysis never overwrites a person's edits, version bump, editable chips in the UI
