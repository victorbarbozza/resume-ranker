import { type SQL, sql } from 'drizzle-orm'
import {
  type AnyPgColumn,
  customType,
  timestamp,
  varchar,
} from 'drizzle-orm/pg-core'

/** Postgres tsvector column, which Drizzle has no built-in type for */
export const tsvector = customType<{ data: string }>({
  dataType: () => 'tsvector',
})

/** Postgres bytea column for binary files, read and written as Buffer */
export const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType: () => 'bytea',
})

/** Creation time, set by the database */
export const createdAt = () =>
  timestamp('created_at', { withTimezone: true }).notNull().defaultNow()

/** Last change time, refreshed on every update */
export const updatedAt = () =>
  timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date())

/** Soft delete: rows stay in the table and every read filters them out */
export const deletedAt = () => timestamp('deleted_at', { withTimezone: true })

/** Model that produced an LLM output; null until the output exists */
export const modelColumn = (name: string) => varchar(name, { length: 100 })
/** Prompt version that produced an LLM output; null until the output exists */
export const promptVersionColumn = (name: string) =>
  varchar(name, { length: 32 })

/** SQL list of quoted values; they come from constants in the code, never from input, so sql.raw is safe */
const listOf = (values: readonly string[]) =>
  sql.raw(values.map((value) => `'${value}'`).join(', '))

/** CHECK expression: the column holds one of the values */
export const oneOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} in (${listOf(values)})`

/** CHECK expression: every element of the array column is one of the values */
export const subsetOf = (column: AnyPgColumn, values: readonly string[]): SQL =>
  sql`${column} <@ array[${listOf(values)}]::text[]`
