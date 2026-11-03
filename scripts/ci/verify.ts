import { appendFileSync, writeFileSync } from 'node:fs'

/**
 * One check the CI runs, as a package script.
 *
 * - `cwd`: the folder it runs in, the repository root unless set
 */
type Check = {
  label: string
  script: string
  cwd?: string
}

/** What a check ended as */
type Result = {
  check: Check
  passed: boolean
  ms: number
}

/** The checks, in the order they run; one that fails does not stop the rest */
const CHECKS: Check[] = [
  { label: 'Lint', script: 'lint' },
  { label: 'Types', script: 'typecheck' },
  { label: 'Infra types', script: 'typecheck', cwd: 'infra/azure' },
  { label: 'Format', script: 'format:check' },
  { label: 'Tests', script: 'test' },
  { label: 'Build', script: 'build' },
]

/** A duration the way a person reads it: 4.2s, 38s, 1m 12s */
const duration = (ms: number) => {
  const seconds = ms / 1000
  if (seconds < 10) return `${seconds.toFixed(1)}s`
  const rounded = Math.round(seconds)
  return rounded < 60
    ? `${rounded}s`
    : `${Math.floor(rounded / 60)}m ${rounded % 60}s`
}

/** Runs one check with its output in a collapsed group of the CI log */
const run = (check: Check): Result => {
  console.info(`::group::${check.label}`)
  const started = performance.now()
  const child = Bun.spawnSync(['bun', 'run', check.script], {
    cwd: check.cwd,
    stdout: 'inherit',
    stderr: 'inherit',
  })
  const ms = performance.now() - started
  console.info('::endgroup::')
  console.info(
    `${child.exitCode === 0 ? '✅' : '❌'} ${check.label} in ${duration(ms)}`
  )
  return { check, passed: child.exitCode === 0, ms }
}

/** The Verify section of the PR comment and the job summary */
const render = (results: Result[]) => {
  const failed = results.filter((result) => !result.passed).length
  return [
    '## 🧪 Verify',
    '',
    `✅ ${results.length - failed} passed · ❌ ${failed} failed · ${duration(results.reduce((sum, result) => sum + result.ms, 0))}`,
    '',
    '| Check | Result | Time |',
    '|---|:-:|--:|',
    ...results.map(
      ({ check, passed, ms }) =>
        `| ${check.label} | ${passed ? '✅' : '❌'} | ${duration(ms)} |`
    ),
  ].join('\n')
}

/**
 * Runs every check, writes the summary to the file given as the first
 * argument and to the job summary, and fails when any check failed.
 */
const main = () => {
  const [outFile] = process.argv.slice(2)
  const results = CHECKS.map(run)
  const summary = render(results)
  if (outFile) writeFileSync(outFile, `${summary}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${summary}\n\n`)
  }
  console.info(`\n${summary}`)
  if (results.some((result) => !result.passed)) process.exit(1)
}

main()
