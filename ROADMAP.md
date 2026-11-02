# Roadmap

Implementation plan, in order. The work goes from the core outwards: data, queue, LLM and the domain APIs first, each proven by integration tests against a real Postgres; then access control around every route; then the UI; then the deploy. Every phase ends with lint, typecheck, tests and build passing. Tick a task once it is done.

## 1. Architecture

- [x] System design, data model, task queue, security and deploy plan defined

## 2. Project base

- [x] Hono API and a React screen built with Vite (replaced the first Next.js 16 app), TypeScript strict, `@/*` alias
- [x] Prettier and ESLint (typescript-eslint, React hooks, accessibility, import order, client code cannot import server modules)
- [x] Postgres 16 in `compose.yaml`, bound to localhost
- [x] Environment config in `src/server/config/env.ts`, with defaults that need no setup
- [x] Drizzle config and Postgres connector
- [x] API app with TypeBox validation per part of the request, body limits, and every error answered as `{ error, message }` (`HTTPError`), with tests
- [x] `GET /api/health` with a database ping
- [x] Typed API client (`hc`), fetch helper (`fetchJson`, `ApiError`) and React Query provider
- [x] Dockerfile (server, worker and migration bundled for Node, plus the built screen) and `app` service in compose
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
- [x] A task claimed past its last attempt is dead without running, so a task that kills the worker stops after its attempts

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
- [x] `POST /api/jobs/:id/retry` queues a failed analysis again; 409 while it is pending or done
- [x] A TypeBox schema for each task payload; handlers validate the payload before using it, so reading a task needs no cast
- [x] `job.analyze` handler: must-have and nice-to-have requirements; skips a deleted job or an older version without calling the LLM, and marks the job failed once the task is dead
- [x] Integration tests

## 7. Resumes API

- [x] `POST /api/candidates`: multipart upload of up to 20 files of 2 MB; answers 202 as soon as every file is stored, with what happened to each (accepted, duplicate, rejected)
- [x] The server computes the sha256 and reads the type from the bytes with `file-type` (PDF or DOCX); an empty file, one over 2 MB or one of another kind is rejected on its own
- [x] A file already in the base is a duplicate, in the same upload or a later one; two uploads of one file at once still create one candidate
- [x] File storage behind one connector (`unstorage`): `fs` by default, Azure Blob with `STORAGE_DRIVER=azure`; the database keeps only the key, the type and the size
- [x] Candidate, file record and task in one transaction, after the file is stored
- [x] Request bodies over the limit are refused from Content-Length before they are read; every route has a 1 MB limit unless it sets its own, and multipart parsing is linear
- [x] Worker heap capped at 384 MB and extracted text cut at 100 000 characters, so a file built to expand when unzipped fails instead of starving the VM
- [x] `GET /api/candidates` with each status
- [x] `POST /api/candidates/:id/retry` (409 while the profile is pending or done) and `DELETE /api/candidates/:id` (soft delete)
- [x] `candidate.extract_profile` handler: the worker reads the text of the file (`unpdf`, `mammoth`), saves it, then extracts areas, skills, years, seniority, languages and summary; a retry reuses the saved text
- [x] Integration tests with real PDF and DOCX files

## 8. Ranking API

- [x] `POST /api/jobs/:id/evaluations` with `area` scope (every ready candidate of the job's area, up to `RANKING_MAX_CANDIDATES`, 50 by default) or `selected` scope, split into batches of 5; the response says how many the limit left out; candidates with a current result are not queued again
- [x] `candidates.evaluate` handler: fixed rubric, strengths with evidence, gaps
- [x] The handler checks that every candidate sent got exactly one result; an unknown id is ignored, the first of two results wins, and a missing one fails the attempt
- [x] `fake` model gives each candidate of a batch a placeholder result with score 0 (a prompt can define its own fake answer)
- [x] Prompt guardrails: resume text delimited as data, output validated against the schema
- [x] `GET /api/jobs/:id/evaluations` with progress counts, stale flags (older job version or older prompt version) and other-area flags; deleted candidates are hidden
- [x] A job whose analysis failed can still be ranked against its raw description, with a warning that results are poorer
- [x] Integration tests

## 9. Access control

- [x] Password hashing with scrypt from `node:crypto` (N=2^14, r=8, p=5, the cost stored in the hash), constant-time compare; an unknown username still runs a hash, tests
- [x] `bun run user:create <username>` script, the only way to create users: prints a random password once; bundled into the image as `create-user.mjs`
- [x] Login rate limit: reserve a slot before the password check, give it back on success, 10 failures per IP per 5 minutes, 429 with `Retry-After`, tests
- [x] Client IP from the last address of `X-Forwarded-For`, which the proxy sets
- [x] Sessions: random 32-byte token, sha256 stored, `HttpOnly` + `Secure` + `SameSite=Lax` cookie, 7-day expiry
- [x] `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- [x] Session middleware on the API: every route requires a session by default, so the routes of earlier phases are protected at once; login and health are the only public routes, listed in one place
- [x] CSRF check (`hono/csrf`): a request a form could send (form, multipart, plain text or no body) needs `Sec-Fetch-Site: same-origin` or the app's `Origin`; JSON from another site is stopped by the CORS preflight, which the API never answers
- [x] Security headers from the server (`hono/secure-headers`: CSP, `frame-ancestors 'none'`, `nosniff`, no referrer, HSTS)
- [x] Integration tests: 401 on every route without a session (the test walks the route table, so a new route is covered), 429 after 10 failures, 403 from another site

## 10. Frontend

- [x] Design tokens (the platform's own font, one blue for what can be pressed, a color per state) and base components: button, fields, a select with its own list (the system picker on touch screens), segmented control, status labels and tags, progress bar, sheet on the native `<dialog>`, page layout
- [x] TanStack Router, declared in one file, and a login page; a signed-out visit to any page goes to `/login` and comes back after signing in
- [x] Client typed from the API routes end to end (`hc` and `parseResponse`); a session that ends mid-use sends the person to sign in again
- [x] Jobs list with search and filters, create and edit form with an area picker, job page with status and requirements, delete, and retry of a failed analysis
- [x] Candidates page: drop any number of PDF and DOCX files anywhere on the page or choose them, checked in the browser, sent five per request and two requests at a time, with per-file status and Send again for files that got no answer; a row opens the profile in a sheet, with Retry and Delete
- [x] Ranking on the job page, above the requirements: the whole area or candidates picked by hand (the job's area first, with earlier scores), progress, results best first with the top strength and gap, stale, other-area and placeholder tags, and one button to update stale or failed results; a row opens its summary, strengths and gaps
- [x] Polling while work is pending: every 2 s in the first minute, every 5 s up to 5 minutes, then every 30 s
- [x] Phone layout: a tab bar, sheets that rise from the bottom, and a ranking row that opens its result on its own screen, with previous and next
- [x] English and Brazilian Portuguese: the language comes from the browser and can be changed from a selector; API errors are shown from their code, in the person's language
- [x] Loading, empty and error states on every list; deletes asked in a sheet; counts and Clear filters on filtered lists

## 11. Deploy (Azure)

- [ ] Budget alert on the subscription
- [ ] Production compose: Caddy with an sslip.io hostname, app port not published
- [ ] Pulumi project: resource group, network, NSG for 22/80/443, static IP, B1s VM, storage account with a private container for resumes
- [ ] cloud-init: Docker, 2 GB swap, firewall
- [ ] `infra.yml`: `pulumi preview` on PRs, `pulumi up` on main, OIDC login
- [ ] `deploy.yml`: build amd64 and arm64 images, push to GHCR, `compose pull && up -d --wait` over ssh (Postgres, migrations, app and worker, health check: the steps of `bun run dev`)
- [ ] GitHub secrets: LLM API key, storage account key, database password, ssh key; the deploy sets `STORAGE_DRIVER=azure`
- [ ] First user created over ssh with `docker compose exec app node create-user.mjs <username>`

## 12. Backups

- [ ] Nightly `pg_dump` to object storage, keeping 7 copies, plus the files volume when `STORAGE_DRIVER=fs`
- [ ] Restore drill documented and tested

## Improvements (after v1)

- [ ] Re-extract profiles after the profile prompt changes: one LLM call per resume, started from the candidates page
- [ ] Cheap pre-filter before the LLM once the base reaches thousands of resumes: embeddings (`pgvector`) or keywords pick the top candidates of the area, and only those are scored
- [ ] Observability screen, already in the design: worker health, queue by task, model pace and 429 answers, stopped tasks with Retry
- [ ] Candidate inspector, already in the design: rankings across jobs, open the resume
- [ ] Smoke test of the screen in CI (Playwright): sign in, create a job, upload resumes, rank
- [ ] Dark mode from the same tokens
- [ ] Editable job requirements: `PATCH /api/jobs/:id/requirements`, `requirements_source` column so re-analysis never overwrites a person's edits, version bump, editable chips in the UI
