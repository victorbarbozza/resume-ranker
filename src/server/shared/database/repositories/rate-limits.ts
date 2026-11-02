import { and, eq, lt, sql } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import { rateLimits as rateLimitsTable } from '@/server/shared/database/schema'

/**
 * Adds one to the counter of a key in a window and returns the new value.
 * A single upsert, so concurrent calls never lose a count.
 */
export const increment = async (
  key: string,
  windowStart: Date
): Promise<number> => {
  const [row] = await db
    .insert(rateLimitsTable)
    .values({ key, windowStart, count: 1 })
    .onConflictDoUpdate({
      target: [rateLimitsTable.key, rateLimitsTable.windowStart],
      set: { count: sql`${rateLimitsTable.count} + 1` },
    })
    .returning({ count: rateLimitsTable.count })
  return row.count
}

/** Gives one count back, never going below zero */
export const decrement = async (
  key: string,
  windowStart: Date
): Promise<void> => {
  await db
    .update(rateLimitsTable)
    .set({ count: sql`greatest(${rateLimitsTable.count} - 1, 0)` })
    .where(
      and(
        eq(rateLimitsTable.key, key),
        eq(rateLimitsTable.windowStart, windowStart)
      )
    )
}

/** Deletes windows that started before the given moment */
export const deleteOlderThan = async (moment: Date): Promise<number> => {
  const rows = await db
    .delete(rateLimitsTable)
    .where(lt(rateLimitsTable.windowStart, moment))
    .returning({ key: rateLimitsTable.key })
  return rows.length
}
