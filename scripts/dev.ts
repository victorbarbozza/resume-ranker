/** A process that `bun run dev` starts with its name in front of each log line */
type DevProcess = { name: string; command: string[]; color: string }

/** The migration step: the same entry the image runs as the `migrate` service */
const migrateProcess: DevProcess = {
  name: 'migrate',
  command: ['bun', 'src/migrate.ts'],
  color: '\x1b[33m',
}

/** The app processes, with live reload in place of `node server.js` and `node worker.mjs` */
const appProcesses: DevProcess[] = [
  { name: 'web', command: ['bunx', 'next', 'dev'], color: '\x1b[36m' },
  {
    name: 'worker',
    command: ['bun', '--watch', 'src/worker.ts'],
    color: '\x1b[35m',
  },
]

/** Host port of the compose Postgres, as compose.yaml publishes it */
const postgresPort = process.env.POSTGRES_PORT ?? '55433'

/** Port of the dev web server; `next dev` reads PORT too */
const webPort = process.env.PORT ?? '3000'

/** How long the web server has to answer its health route */
const HEALTH_TIMEOUT_MS = 60_000

/** Whether the terminal shows colors */
const colorful = Boolean(process.stdout.isTTY)

/** Wraps text in an ANSI color when the terminal shows colors */
const paint = (text: string, color: string) =>
  colorful ? `${color}${text}\x1b[0m` : text

/** Prints the title of a step, like a CI log */
const step = (title: string) => console.info(paint(`▶ ${title}`, '\x1b[1m'))

/** Prints a finished step */
const done = (message: string) =>
  console.info(`${paint('✓', '\x1b[32m')} ${message}`)

/** Prints a failed step and stops the script */
const fail = (message: string, details = ''): never => {
  console.error(`${paint('✗', '\x1b[31m')} ${message}`)
  if (details) console.error(details)
  process.exit(1)
}

/** Runs a command to completion and returns its exit code and combined output */
const runQuiet = async (command: string[]) => {
  const child = Bun.spawn(command, { stdout: 'pipe', stderr: 'pipe' })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  return { code, output: `${stdout}${stderr}`.trim() }
}

/** Writes every line of a stream with the process prefix in front, skipping blank lines and cursor codes */
const prefixLines = async (
  stream: ReadableStream<Uint8Array>,
  prefix: string,
  write: (line: string) => void
) => {
  const decoder = new TextDecoder()
  const writeLine = (line: string) => {
    const visible = line.replace(/\x1b\[\?25[hl]/g, '')
    if (visible.trim()) write(`${prefix} ${visible}`)
  }
  let pending = ''
  for await (const chunk of stream) {
    pending += decoder.decode(chunk, { stream: true })
    const lines = pending.split('\n')
    pending = lines.pop() ?? ''
    for (const line of lines) writeLine(line)
  }
  writeLine(pending)
}

/** Starts one process with its output prefixed by its name; `logs` settles once its output is fully written */
const start = ({ name, command, color }: DevProcess) => {
  const child = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: colorful
      ? { ...process.env, FORCE_COLOR: '1' }
      : { ...process.env, NO_COLOR: '1' },
  })
  const prefix = paint(`[${name}]`, color)
  const logs = Promise.all([
    prefixLines(child.stdout, prefix, (line) => console.info(line)),
    prefixLines(child.stderr, prefix, (line) => console.error(line)),
  ])
  return { name, child, logs }
}

/** Asks the health route once a second until it answers 200, or gives up after the timeout */
const waitForHealth = async (url: string, timeoutMs: number) => {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const healthy = await fetch(url).then(
      (response) => response.ok,
      () => false
    )
    if (healthy) return true
    await Bun.sleep(1_000)
  }
  return false
}

/**
 * Runs the deploy steps on this machine, in the order compose runs them on the
 * VM: Docker, Postgres, migrations, the app, then its health check. Keeps the
 * app running until one process exits or Ctrl+C.
 */
const main = async () => {
  step('Check Docker')
  const docker = await runQuiet([
    'docker',
    'info',
    '--format',
    '{{.ServerVersion}}',
  ])
  if (docker.code !== 0) {
    fail('Docker is not running. Start Docker and run `bun run dev` again.')
  }
  done(`Docker ${docker.output} is running`)

  step('Start Postgres')
  const postgres = await runQuiet([
    'docker',
    'compose',
    'up',
    '-d',
    '--wait',
    'postgres',
  ])
  if (postgres.code !== 0) {
    fail('Postgres did not become healthy.', postgres.output)
  }
  done(`Postgres is healthy on localhost:${postgresPort}`)

  step('Run migrations')
  const migration = start(migrateProcess)
  const [migrationCode] = await Promise.all([
    migration.child.exited,
    migration.logs,
  ])
  if (migrationCode !== 0) {
    fail('Migrations failed, so the app was not started.')
  }

  step('Start web and worker')
  const running = appProcesses.map(start)

  let stopping = false
  const stopAll = async (code: number) => {
    if (stopping) return
    stopping = true
    for (const { child } of running) child.kill()
    await Promise.all(running.map(({ child }) => child.exited))
    console.info('Postgres keeps running; `bun run dev:down` stops it.')
    process.exit(code)
  }

  process.on('SIGINT', () => void stopAll(0))
  process.on('SIGTERM', () => void stopAll(0))
  for (const { name, child } of running) {
    void child.exited.then((code) => {
      if (stopping) return
      console.error(
        `${paint('✗', '\x1b[31m')} ${name} exited with code ${code}; stopping the rest`
      )
      void stopAll(code || 1)
    })
  }

  step('Check health')
  const healthUrl = `http://localhost:${webPort}/api/health`
  if (!(await waitForHealth(healthUrl, HEALTH_TIMEOUT_MS))) {
    console.error(
      `${paint('✗', '\x1b[31m')} ${healthUrl} did not answer within ${HEALTH_TIMEOUT_MS / 1000} s; stopping`
    )
    await stopAll(1)
  }
  done(`App ready at http://localhost:${webPort}`)
}

void main()
