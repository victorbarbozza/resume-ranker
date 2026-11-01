import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { beforeAll, describe, expect, test } from 'bun:test'

import { migrationsFolder } from '@/server/config/env'
import { prepareTestDatabase } from '@/server/test/database'

import { describeDatabaseUrl, runMigrations } from './migrate'

beforeAll(prepareTestDatabase)

describe('describeDatabaseUrl', () => {
  test('keeps host, port and database and drops the credentials', () => {
    expect(
      describeDatabaseUrl('postgres://dev:secret@localhost:55433/resume_ranker')
    ).toBe('localhost:55433/resume_ranker')
  })

  test('shows the default port when the URL has none', () => {
    expect(describeDatabaseUrl('postgres://user:pw@db.internal/app')).toBe(
      'db.internal:5432/app'
    )
  })
})

describe('runMigrations', () => {
  test('applies nothing on a database that is already migrated', async () => {
    const journal = JSON.parse(
      readFileSync(join(migrationsFolder, 'meta/_journal.json'), 'utf8')
    )

    expect(await runMigrations()).toEqual({
      applied: 0,
      total: journal.entries.length,
    })
  })
})
