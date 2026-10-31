/**
 * Tech terms whose punctuation carries meaning. Without these rules Postgres
 * reads "C#", "C++" and "C" as the same word "c", and "Node.js" and "NodeJS"
 * as two different words. Rules run in order, so specific ones come first.
 */
const TERM_RULES: Array<[RegExp, string]> = [
  [/\bc\+\+(?![a-z0-9])/g, 'cpp'],
  [/\bc#(?![a-z0-9])/g, 'csharp'],
  [/\bf#(?![a-z0-9])/g, 'fsharp'],
  [/\basp\.net\b/g, 'aspnet'],
  [/(^|[^a-z0-9])\.net\b/g, '$1dotnet'],
  [/\b([a-z0-9]+)\.js\b/g, '$1js'],
  [/\b(node|next|nuxt|nest|express|react|vue)\s+js\b/g, '$1js'],
  [/\bci\s*\/\s*cd\b/g, 'cicd'],
]

/** Spellings of the same thing, mapped to one canonical word */
const SYNONYMS: Record<string, string> = {
  reactjs: 'react',
  vuejs: 'vue',
  golang: 'go',
  postgresql: 'postgres',
  k8s: 'kubernetes',
  js: 'javascript',
  ts: 'typescript',
}

/** Matches any word that has a canonical spelling in SYNONYMS */
const synonymPattern = new RegExp(
  `\\b(${Object.keys(SYNONYMS).join('|')})\\b`,
  'g'
)

/**
 * Prepares text for full-text search, both when a resume is indexed and when
 * a job is searched, so the two sides always agree.
 *
 * Lowercases, drops accents ("gestão" matches "gestao"), rewrites tech terms
 * whose punctuation matters and maps known synonyms to one word.
 */
export const normalizeSearchText = (text: string): string => {
  let normalized = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')

  for (const [pattern, replacement] of TERM_RULES) {
    normalized = normalized.replace(pattern, replacement)
  }

  return normalized
    .replace(synonymPattern, (word) => SYNONYMS[word])
    .replace(/\s+/g, ' ')
    .trim()
}
