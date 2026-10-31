import { and, eq, gt, lte, sql } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import {
  sessions as sessionsTable,
  users as usersTable,
} from '@/server/shared/database/schema'

/** What a login stores; the token itself is never part of it */
export type CreateSessionInput = {
  idHash: string
  userId: string
  expiresAt: Date
  ip: string | null
}

/** A session that has not expired, with its user */
export type ActiveSession = {
  userId: string
  username: string
  expiresAt: string
}

/** Stores a new session */
export const create = async (input: CreateSessionInput): Promise<void> => {
  await db.insert(sessionsTable).values(input)
}

/** The user behind a session that has not expired */
export const findActive = async (
  idHash: string
): Promise<ActiveSession | undefined> => {
  const [row] = await db
    .select({
      userId: sessionsTable.userId,
      username: usersTable.username,
      expiresAt: sessionsTable.expiresAt,
    })
    .from(sessionsTable)
    .innerJoin(usersTable, eq(usersTable.id, sessionsTable.userId))
    .where(
      and(
        eq(sessionsTable.idHash, idHash),
        gt(sessionsTable.expiresAt, sql`now()`)
      )
    )
  return row ? { ...row, expiresAt: row.expiresAt.toISOString() } : undefined
}

/** Deletes a session, which signs it out */
export const remove = async (idHash: string): Promise<void> => {
  await db.delete(sessionsTable).where(eq(sessionsTable.idHash, idHash))
}

/** Deletes expired sessions and returns how many were removed */
export const deleteExpired = async (): Promise<number> => {
  const rows = await db
    .delete(sessionsTable)
    .where(lte(sessionsTable.expiresAt, sql`now()`))
    .returning({ idHash: sessionsTable.idHash })
  return rows.length
}
