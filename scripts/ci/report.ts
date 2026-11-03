import { appendFileSync, existsSync, readFileSync } from 'node:fs'

/** One resource step of `pulumi preview --json` */
type PreviewStep = {
  op: string
  urn: string
  diffReasons?: string[] | null
  replaceReasons?: string[] | null
  detailedDiff?: Record<string, unknown> | null
}

/** What `pulumi preview --json` writes, as far as the report reads it */
type Preview = {
  steps?: PreviewStep[] | null
  diagnostics?: { message: string; severity: string }[] | null
}

/** The kinds of change the report groups the steps into */
type Kind = 'create' | 'import' | 'update' | 'replace' | 'delete'

/** One resource the deploy would change */
type Change = {
  kind: Kind
  type: string
  name: string
  properties: string[]
}

/** Marks the comment the CI keeps updating on a PR */
const MARKER = '<!-- ci-report -->'

/** Most changes listed before the rest is cut */
const MAX_CHANGES = 50

/** Most characters of the preview errors shown */
const MAX_ERROR_LENGTH = 3000

/** How each kind of change shows, in the order the report lists them */
const KINDS: Record<Kind, { icon: string; label: string }> = {
  replace: { icon: '♻️', label: 'Replace' },
  delete: { icon: '🗑️', label: 'Delete' },
  create: { icon: '➕', label: 'Create' },
  import: { icon: '📥', label: 'Import' },
  update: { icon: '✏️', label: 'Update' },
}

/** The kind each Pulumi step operation counts as; `same` and reads count as none */
const KIND_OF_OP: Record<string, Kind> = {
  create: 'create',
  import: 'import',
  update: 'update',
  replace: 'replace',
  'create-replacement': 'replace',
  'delete-replaced': 'replace',
  'import-replacement': 'replace',
  delete: 'delete',
  discard: 'delete',
  'discard-replaced': 'delete',
}

/** Wraps a value in inline code */
const code = (value: string) => `\`${value}\``

/** `azure-native:app/v20240301:ContainerApp` becomes `azure-native:app:ContainerApp` */
const shortType = (qualified: string) => {
  const type = qualified.split('$').pop() ?? qualified
  const [pkg, module, name] = type.split(':')
  return name ? `${pkg}:${module.split('/')[0]}:${name}` : type
}

/** The properties that make a step change: why it replaces, else what differs */
const propertiesOf = (step: PreviewStep, kind: Kind) => {
  const lists = [
    kind === 'replace' ? step.replaceReasons : undefined,
    step.detailedDiff ? Object.keys(step.detailedDiff) : undefined,
    step.diffReasons,
  ]
  return [
    ...new Set(lists.find((list) => list && list.length > 0) ?? []),
  ].sort()
}

/** The resources the preview would change, one entry each */
const changesOf = (preview: Preview): Change[] => {
  const changes = new Map<string, Change>()
  for (const step of preview.steps ?? []) {
    const kind = KIND_OF_OP[step.op]
    const key = `${kind} ${step.urn}`
    if (!kind || changes.has(key)) continue
    const [, , qualified, ...name] = step.urn.split('::')
    changes.set(key, {
      kind,
      type: shortType(qualified),
      name: name.join('::'),
      properties:
        kind === 'update' || kind === 'replace' ? propertiesOf(step, kind) : [],
    })
  }
  const order = Object.keys(KINDS)
  return [...changes.values()].sort(
    (a, b) =>
      order.indexOf(a.kind) - order.indexOf(b.kind) ||
      a.name.localeCompare(b.name)
  )
}

/** The preview written to the file, or undefined when it failed before writing one */
const readPreview = (file: string): Preview | undefined => {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Preview
  } catch {
    return undefined
  }
}

/** The Preview section: a headline, alerts for replaces and deletes, then every change */
const renderPreview = (preview: Preview | undefined) => {
  const errors = (preview?.diagnostics ?? [])
    .filter((diagnostic) => diagnostic.severity === 'error')
    .map((diagnostic) => diagnostic.message.replace(/^error: /, '').trim())
  if (!preview || errors.length > 0) {
    const text = errors.join('\n\n')
    return [
      '❌ **Failed**',
      '',
      ...(text
        ? [
            '```text',
            text.length > MAX_ERROR_LENGTH
              ? `${text.slice(0, MAX_ERROR_LENGTH)}\n…`
              : text,
            '```',
          ]
        : ['It failed before the preview. The run log says why.']),
    ]
  }
  const changes = changesOf(preview)
  if (changes.length === 0) return ['✅ **No changes**']
  const risky = changes.filter(
    ({ kind }) => kind === 'replace' || kind === 'delete'
  )
  const counts = Object.entries(KINDS).flatMap(([kind, { icon }]) => {
    const count = changes.filter((change) => change.kind === kind).length
    return count > 0 ? [`${icon} ${count}`] : []
  })
  const shown = changes.slice(0, MAX_CHANGES)
  return [
    `${risky.length > 0 ? '🔴 **Replaces or deletes**' : '🟡 **Changes**'} · ${counts.join(' · ')}`,
    '',
    ...(risky.length > 0
      ? [
          '> [!WARNING]',
          ...risky.map(
            ({ kind, type, name, properties }) =>
              `> - ${KINDS[kind].label.toLowerCase()}s ${code(type)} **${name}**${properties.length > 0 ? ` because of ${properties.map(code).join(', ')}` : ''}`
          ),
          '',
        ]
      : []),
    '| | Resource | Type | Properties |',
    '|:-:|---|---|---|',
    ...shown.map(
      ({ kind, type, name, properties }) =>
        `| ${KINDS[kind].icon} | ${code(name)} | ${code(type)} | ${properties.map(code).join(' ')} |`
    ),
    ...(changes.length > shown.length
      ? ['', `… and ${changes.length - shown.length} more`]
      : []),
  ]
}

/**
 * Prints the PR comment: the Verify summary from the first argument, then
 * the infra preview read from the JSON file in the second. The Preview
 * section also goes to the job summary.
 */
const main = () => {
  const [verifyFile, previewFile] = process.argv.slice(2)
  const verify = existsSync(verifyFile)
    ? readFileSync(verifyFile, 'utf8').trim()
    : '## 🧪 Verify\n\nIt did not finish. The run log says why.'
  const preview = [
    '## 🔮 Infra preview',
    '',
    `Commit ${code((process.env.HEAD_SHA ?? '').slice(0, 7))} · [run](${process.env.RUN_URL ?? ''})`,
    '',
    ...renderPreview(readPreview(previewFile)),
  ].join('\n')
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${preview}\n`)
  }
  console.info([MARKER, verify, '', preview].join('\n'))
}

main()
