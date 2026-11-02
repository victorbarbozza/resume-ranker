# Resume Ranker

Rank candidates for a job opening. Register a job, upload resumes (PDF or DOCX) and get every candidate from the job's area ranked with a score, strengths and gaps.

> Work in progress. [ROADMAP.md](ROADMAP.md) lists what is done and what comes next.

## Stack

- Hono for the API, on Node in the image
- React and Vite for the screen, a single-page app the same server serves
- PostgreSQL 16 with Drizzle ORM: data and task queue
- TypeBox for request and LLM output schemas
- Vercel AI SDK for the LLM: Azure OpenAI, Anthropic's Claude, Ollama, or a fake model that needs no key
- TanStack Router and TanStack Query on the client, with a client typed from the API routes
- i18next for the screen in English and Brazilian Portuguese
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

`bun run dev` runs the deploy steps on your machine, in the order compose runs them on the server: check Docker, start Postgres and wait until it is healthy, apply pending migrations, start the app (the API, which also works the task queue) and the screen with live reload, then wait for `/api/health` through the screen's dev server. The screen is on http://localhost:3000; Vite sends `/api` to the API on port 3001. Each step prints its name, each process prints its name in front of every log line, and a failed step stops the ones after it. Ctrl+C stops the app; Postgres keeps running until `bun run dev:down`.

To run the production image instead, the same way the server does:

```bash
docker compose up -d --build --wait
```

Both follow the same steps:

| Step       | `bun run dev`                                                        | `docker compose up` (local and on the server)                 |
| ---------- | -------------------------------------------------------------------- | ------------------------------------------------------------- |
| Database   | `docker compose up -d --wait postgres`                               | `postgres` service, healthy                                   |
| Migrations | `bun src/migrate.ts`                                                 | `migrate` service: `node migrate.mjs`, the same file bundled  |
| App        | `bun --watch src/server.ts` (API and queue worker) and Vite (screen) | `app` (`node server.mjs`: API, queue worker and built screen) |
| Health     | waits for `GET /api/health`                                          | `app` health check, which `--wait` waits for                  |

The app never changes the schema: it starts only after the migration step exits successfully.

One process serves the API and the screen and works the task queue, so the whole app is one container with one replica. The LLM pace is kept in memory, which holds because one process runs; a DOCX is checked to unzip to at most 10 MB before it is read, so a zip bomb fails its task at once instead of filling the memory the API shares. A task that cannot succeed by trying again, such as that file or an answer the LLM declines, is dead on its first attempt.

### Signing in

Every route needs a session except the health check and the login, and there is no sign-up page or default account. Create a user once; the script prints a random password a single time and stores only its scrypt hash:

```bash
bun run user:create alice                            # the database of bun run dev
docker compose exec app node create-user.mjs alice   # the database of the running image, here or on the server
```

The session cookie is `Secure`, which browsers accept on `http://localhost` too.

## Configuration

Nothing needs to be configured to run locally: every variable has a default that matches `compose.yaml`. Set a variable in the shell to change it, for example `APP_PORT=3001 docker compose up -d`.

| Variable                                                                  | Default                                                 | Used by                                                                                                    |
| ------------------------------------------------------------------------- | ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                                            | `postgres://dev:dev@localhost:55433/resume_ranker`      | app                                                                                                        |
| `POSTGRES_USER` / `POSTGRES_PASSWORD`                                     | `dev` / `dev`                                           | compose (Postgres and the app)                                                                             |
| `POSTGRES_PORT`                                                           | `55433`                                                 | compose: host port of Postgres                                                                             |
| `APP_PORT`                                                                | `3000`                                                  | compose: host port of the app                                                                              |
| `TEST_DATABASE_URL`                                                       | `postgres://dev:dev@localhost:55433/resume_ranker_test` | tests (must end in `_test`)                                                                                |
| `LLM_MODEL`                                                               | `fake`                                                  | app: `<provider>:<model>`, such as `azure:my-deployment`, `anthropic:claude-opus-5-5` or `ollama:llama3.2` |
| `LLM_RPM`                                                                 | `10` for azure and anthropic, `30` for ollama           | app: LLM calls per minute                                                                                  |
| `AZURE_RESOURCE_NAME` / `AZURE_API_KEY`                                   | none                                                    | app, with an `azure:` model                                                                                |
| `ANTHROPIC_API_KEY`                                                       | none                                                    | app, with an `anthropic:` model                                                                            |
| `OLLAMA_BASE_URL`                                                         | `http://localhost:11434/v1`                             | app, with an `ollama:` model                                                                               |
| `STORAGE_DRIVER`                                                          | `fs`                                                    | app: where uploaded files live, `fs` or `azure`                                                            |
| `STORAGE_DIR`                                                             | `data/files` (`/app/data/files` in the image)           | app, with `fs`                                                                                             |
| `AZURE_STORAGE_ACCOUNT` / `AZURE_STORAGE_KEY` / `AZURE_STORAGE_CONTAINER` | none                                                    | app, with `azure`                                                                                          |

### Using a real LLM

The default `fake` model is not an LLM: it answers every prompt at once with placeholder values that match its schema, so the app and its tests run with no key, no GPU and no network. The app warns when it is on. To rank for real, export the model and its key in the shell that starts the app; they are read at run time and never written to a file:

```bash
export LLM_MODEL=azure:my-deployment AZURE_RESOURCE_NAME=my-resource AZURE_API_KEY=...
bun run dev
```

Claude runs the same way, with a key from the Claude Console:

```bash
export LLM_MODEL=anthropic:claude-opus-5-5 ANTHROPIC_API_KEY=...
bun run dev
```

A request Claude declines goes to the model Anthropic recommends for it; one that stays declined fails like any other attempt. `LLM_MODEL=ollama:llama3.2` runs a local model instead. The app checks the variables when it starts and refuses to start, naming what is missing. Compose passes the same variables to the app container; from there, an Ollama running on the host is `OLLAMA_BASE_URL=http://host.docker.internal:11434/v1`. Tests always use `fake`.

Each provider is one entry in `src/server/shared/connectors/llm/config.ts`: the package that talks to it, the variables it needs and its default pace. Adding a provider is a package and an entry; no task changes.

### Uploaded files

Resumes are stored by the server, under a key made from their sha256, through one connector (`src/server/shared/connectors/storage`): a folder by default (a volume in compose), or Azure Blob with `STORAGE_DRIVER=azure`, which the deploy uses so files never live on a container's disk. Adding a place is an entry in that connector's map. The database keeps only the key, the type and the size. The queue worker reads each file back to extract its text, outside any request.

## Deploy

The app runs on Azure as three generic pieces, which every major cloud offers, so moving it is a deploy change, not a code change:

| Piece                                           | Azure (today)                           | AWS                | Google Cloud                    | Oracle Cloud             |
| ----------------------------------------------- | --------------------------------------- | ------------------ | ------------------------------- | ------------------------ |
| One container, always on (API and queue worker) | Container Apps                          | ECS on Fargate     | Cloud Run, one minimum instance | Container Instances      |
| Managed PostgreSQL                              | Database for PostgreSQL Flexible Server | RDS for PostgreSQL | Cloud SQL for PostgreSQL        | Database with PostgreSQL |
| Files                                           | Blob Storage                            | S3                 | Cloud Storage                   | Object Storage           |

The image, the schema and the code stay the same; a storage driver is one entry in the storage connector, and an LLM provider one entry in the LLM connector. Everything Azure-specific lives in `infra/azure`.

What `infra/azure` creates, in Brazil South: the app (0.25 vCPU, 0.5 GiB, one replica always on, HTTPS on the address Container Apps gives it), a job that runs the migrations, PostgreSQL B1ms with 32 GB and 7 days of backups, a storage account with a private `resumes` container, Azure OpenAI with one model deployment (in East US 2), and a budget alert. Costs: about $3–5 a month in the free year of the database, then about $36–38, plus the tokens the model uses.

Once, with `az login` and `gh auth login` done in this repository:

```bash
STATE_STORAGE_ACCOUNT=stresumerankerstate42 PULUMI_CONFIG_PASSPHRASE=... BUDGET_EMAIL=you@example.com \
  infra/azure/scripts/bootstrap.sh
```

It is the only step that needs an owner of the subscription. It registers the resource providers, creates the `rg-resume-ranker` resource group and the storage account that keeps the Pulumi state, and gives the CI a service principal with a client secret and the GitHub secrets the workflows read. That principal holds two grants and nothing else: a custom role, `resume-ranker-deployer`, on `rg-resume-ranker` only, which allows the resource types the stack creates (Container Apps, PostgreSQL, storage, Azure OpenAI, budgets) and cannot grant access; and read and write on the `pulumi-state` container. Running it again rotates the secret and updates the role.

Then every push to `main` builds the image, pushes it to GHCR, applies `infra/azure` with Pulumi, runs the migration job with the new image, moves the app to it and waits for `/api/health`. On the first push, make the `resume-ranker` package public in GitHub once the image is there, so Container Apps can pull it, and run the workflow again. Pull requests that touch `infra/` get a `pulumi preview`.

The first user is created inside the running app:

```bash
az containerapp exec --name ca-resume-ranker --resource-group rg-resume-ranker --command "node create-user.mjs <username>"
```

## Scripts

| Script                           | What it does                                                |
| -------------------------------- | ----------------------------------------------------------- |
| `bun run dev`                    | Runs the deploy steps locally, with live reload             |
| `bun run build`                  | Builds the screen into `dist/web`                           |
| `bun run lint`                   | ESLint                                                      |
| `bun run typecheck`              | `tsc --noEmit`                                              |
| `bun run test`                   | Unit and integration tests (needs `bun run dev:up`)         |
| `bun run format`                 | Prettier                                                    |
| `bun run db:generate`            | Generate a migration from the Drizzle schema                |
| `bun run db:migrate`             | Apply pending migrations (the step before the app)          |
| `bun run user:create <username>` | Create a user and print its random password once            |
| `bun run dev:up` / `dev:down`    | Start or stop local Postgres                                |
| `bun run dev:reset`              | Wipe everything local: containers, volumes and stored files |

## Project layout

```
src/
  web/            the screen: router.tsx (every route), components/, domains/ (one folder per server domain), i18n/ (English and Portuguese), lib/ (typed API client, query client)
  server/
    api.ts        the Hono app: every route under /api, errors as { error, message }
    config/       environment variables
    domains/      per domain: routes.ts (paths and validation) and services/ (rules)
    shared/       database, queue, connectors, HTTP middleware
    tasks/        one handler per task type; prompts/ holds one prompt per type
  server.ts       entry: the API, the queue worker, and the built screen in the image
  migrate.ts      migration step, run before the app
  create-user.ts  creates a user: the only way to get one
infra/azure/      Pulumi program and the bootstrap, deploy and release scripts
```

A request flows route (path and validation) → service → repository or connector, and no layer is skipped. The screen calls the API through a client typed from those routes (`src/web/lib/api.ts`). Client code may import types from `src/server`, never modules; ESLint enforces it. Code that both sides run, such as the list of areas, lives in `src/shared`.

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
