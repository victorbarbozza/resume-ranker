import { type SQL, sql } from 'drizzle-orm'
import type { AnyPgColumn } from 'drizzle-orm/pg-core'

import { normalizeSearchText } from './normalize'

/**
 * Weight of each label when ranking, in the order Postgres expects: D, C, B, A.
 * These are Postgres' defaults, so a match under label A counts five times a
 * match under label C.
 */
const RANK_WEIGHTS = sql.raw(`'{0.1, 0.2, 0.4, 1.0}'::float4[]`)

/**
 * Label of each profile field in the search document, from A (highest) to D.
 * B and D are free for future profile fields, such as past job titles.
 */
export const WEIGHT_LABELS = { skills: 'A', summary: 'C' } as const

/**
 * The "simple" config: no stemming and no stop words, since resumes mix
 * languages and no single-language config fits all of them. Plurals do not
 * match singulars ("developers" does not find "developer").
 */
const CONFIG = sql.raw(`'simple'::regconfig`)

/** One field of the search document, normalized and tagged with its label */
const weighted = (text: string, label: 'A' | 'B' | 'C' | 'D'): SQL =>
  sql`setweight(to_tsvector(${CONFIG}, ${normalizeSearchText(text)}), ${sql.raw(`'${label}'`)})`

/** The search document of a candidate, built from its LLM profile only; the raw resume text is never searched */
export const searchDocument = (profile: {
  skills: string[]
  summary: string
}): SQL =>
  sql`${weighted(profile.skills.join(', '), WEIGHT_LABELS.skills)} || ${weighted(profile.summary, WEIGHT_LABELS.summary)}`

/**
 * A query that matches any of the terms. A term with several words must
 * appear as that exact phrase. Returns undefined when no term has a letter or
 * digit left after normalization, since such a query would match nothing.
 */
export const anyTermQuery = (terms: string[]): SQL | undefined => {
  const phrases = terms
    .map(normalizeSearchText)
    .filter((term) => /[a-z0-9]/.test(term))
  if (phrases.length === 0) return undefined

  const queries = phrases.map(
    (phrase) => sql`phraseto_tsquery(${CONFIG}, ${phrase})`
  )
  return sql`(${sql.join(queries, sql` || `)})`
}

/** Either query matches */
export const eitherQuery = (left: SQL, right: SQL): SQL =>
  sql`(${left} || ${right})`

/** True when the document matches the query */
export const matches = (document: AnyPgColumn, query: SQL): SQL =>
  sql`${document} @@ ${query}`

/** Full-text rank of the document for the query, using RANK_WEIGHTS */
export const rank = (document: AnyPgColumn, query: SQL): SQL<number> =>
  sql<number>`ts_rank_cd(${RANK_WEIGHTS}, ${document}, ${query})`
