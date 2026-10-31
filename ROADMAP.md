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

## 3. Database

- [ ] Fixed area list (`engineering`, `data`, `design`, `product`, `marketing`, `sales`, `finance`, `people`, `operations`, `other`) as a shared constant
- [ ] Tables: `jobs`, `candidates`, `resume_files`, `evaluations`, `tasks`, `users`, `sessions`, `rate_limits`
- [ ] Generated `search_vector` on `candidates` (profile skills weight A, resume text weight D) with a GIN index
- [ ] First migration with `bun run db:generate`
- [ ] Migrations run on boot (`src/instrumentation.ts`) and ship in the image
- [ ] One repository per table
- [ ] Integration test setup: separate test database, migrations before the suite, Postgres service in CI
- [ ] Repository integration tests

## 4. Queue and worker

- [ ] `enqueue` inside the caller's transaction
- [ ] Claim with `FOR UPDATE SKIP LOCKED`
- [ ] Retries with backoff (10 s, 20 s, 40 s, 80 s) and `dead` after the 5th failure
- [ ] Lock recovery: `running` for more than 5 minutes goes back to `queued`
- [ ] Processor registry: one processor per task type
- [ ] Maintenance tick: delete old `rate_limits` windows and expired sessions
- [ ] `src/worker.ts` entry, `bun run dev:worker`, bundled into the image
- [ ] `worker` service in compose
- [ ] Integration tests: claim, concurrent claims, retry, dead, lock recovery

## 5. LLM connector

- [ ] `generateJson(prompt, schema)` interface, provider picked by `LLM_PROVIDER`
- [ ] `fake` provider: deterministic answers, no API key
- [ ] `gemini` provider over plain `fetch`, with the TypeBox schema as JSON Schema output
- [ ] `ollama` provider for a local model
- [ ] Output validated with TypeBox; invalid output counts as a failed attempt
- [ ] Provider 429 reschedules the task without spending an attempt
- [ ] Pace: at least `60 s ÷ LLM_RPM` between calls
- [ ] Tests with a mocked `fetch`

## 6. Jobs API

- [ ] `POST /api/jobs` (title, description, area) stores the job and queues `job.analyze` in one transaction
- [ ] `GET /api/jobs` and `GET /api/jobs/:id`
- [ ] `PATCH /api/jobs/:id` bumps `version` and queues a new analysis
- [ ] `DELETE /api/jobs/:id` (soft delete)
- [ ] `job.analyze` processor: must-have and nice-to-have requirements
- [ ] Integration tests

## 7. Resumes API

- [ ] `POST /api/candidates` (multipart: file, text, sha256): candidate, file and task in one transaction
- [ ] Duplicate `content_hash` answers 200 with the existing candidate
- [ ] Files over 5 MB and empty text are rejected with a clear error
- [ ] `GET /api/candidates` with each status
- [ ] `POST /api/candidates/:id/retry` and `DELETE /api/candidates/:id` (soft delete)
- [ ] `candidate.extract_profile` processor: areas, skills, years, seniority, languages, summary
- [ ] Integration tests

## 8. Ranking API

- [ ] Shortlist query: same area, at least one must-have match, top N by `ts_rank_cd`
- [ ] `POST /api/jobs/:id/evaluations` with `shortlist` or `selected` scope, split into batches of 5
- [ ] `candidates.evaluate` processor: fixed rubric, strengths with evidence, gaps
- [ ] Prompt guardrails: resume text delimited as data, output validated against the schema
- [ ] `GET /api/jobs/:id/evaluations` with progress counts and stale flags
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
- [ ] Ranking on the job page: scope (shortlist or selected), progress, table with stale and other-area chips
- [ ] Polling while work is pending

## 11. Deploy (Azure)

- [ ] Budget alert on the subscription
- [ ] Production compose: Caddy with an sslip.io hostname, app port not published
- [ ] Pulumi project: resource group, network, NSG for 22/80/443, static IP, B1s VM
- [ ] cloud-init: Docker, 2 GB swap, firewall
- [ ] `infra.yml`: `pulumi preview` on PRs, `pulumi up` on main, OIDC login
- [ ] `deploy.yml`: build amd64 and arm64 images, push to GHCR, `compose pull && up -d` over ssh
- [ ] GitHub secrets: LLM API key, database password, ssh key

## 12. Backups

- [ ] Nightly `pg_dump` to object storage, keeping 7 copies
- [ ] Restore drill documented and tested

## Improvements (after v1)

- [ ] Editable job requirements: `PATCH /api/jobs/:id/requirements`, `requirements_source` column so re-analysis never overwrites a person's edits, version bump, editable chips in the UI
