/** A long-running process that `bun run dev` starts, prefixes and watches */
type DevProcess = { name: string; command: string[]; color: string }

/** Every process the app runs in development; the worker joins this list once it exists */
const processes: DevProcess[] = [
  { name: 'web', command: ['bunx', 'next', 'dev'], color: '\x1b[36m' },
]

/** Host port of the compose Postgres, as compose.yaml publishes it */
const postgresPort = process.env.POSTGRES_PORT ?? '55433'

/** Whether the terminal shows colors */
const colorful = Boolean(process.stdout.isTTY)

/** Wraps text in an ANSI color when the terminal shows colors */
const paint = (text: string, color: string) =>
  colorful ? `${color}${text}\x1b[0m` : text

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
const run = async (command: string[]) => {
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

/** Starts one process with its output prefixed by its name */
const start = ({ name, command, color }: DevProcess) => {
  const child = Bun.spawn(command, {
    stdout: 'pipe',
    stderr: 'pipe',
    env: colorful
      ? { ...process.env, FORCE_COLOR: '1' }
      : { ...process.env, NO_COLOR: '1' },
  })
  const prefix = paint(`[${name}]`, color)
  void prefixLines(child.stdout, prefix, (line) => console.info(line))
  void prefixLines(child.stderr, prefix, (line) => console.error(line))
  return { name, child }
}

/** Checks Docker, waits for Postgres, then runs every process until one exits or Ctrl+C */
const main = async () => {
  const docker = await run(['docker', 'info', '--format', '{{.ServerVersion}}'])
  if (docker.code !== 0) {
    fail('Docker is not running. Start Docker and run `bun run dev` again.')
  }
  done(`Docker ${docker.output} is running`)

  const postgres = await run([
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

  const running = processes.map(start)
  done(`Started ${running.map(({ name }) => name).join(', ')}`)

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
}

void main()
