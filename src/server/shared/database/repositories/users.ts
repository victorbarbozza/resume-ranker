import { eq } from 'drizzle-orm'

import { db } from '@/server/shared/connectors/postgres'
import { users as usersTable } from '@/server/shared/database/schema'
import type { IUser } from '@/server/shared/schemas/user.schema'

/** Every column a user exposes; the password hash is left out */
const userColumns = {
  id: usersTable.id,
  username: usersTable.username,
  createdAt: usersTable.createdAt,
}

/** A users row without the password hash */
type UserRow = { id: string; username: string; createdAt: Date }

/** Maps a row to the user the rest of the server sees */
const toUser = (row: UserRow): IUser => ({
  id: row.id,
  username: row.username,
  createdAt: row.createdAt.toISOString(),
})

/** Stores a new user with an already hashed password */
export const create = async (input: {
  username: string
  passwordHash: string
}): Promise<IUser> => {
  const [row] = await db.insert(usersTable).values(input).returning(userColumns)
  return toUser(row)
}

/** A user by id */
export const findById = async (id: string): Promise<IUser | undefined> => {
  const [row] = await db
    .select(userColumns)
    .from(usersTable)
    .where(eq(usersTable.id, id))
  return row ? toUser(row) : undefined
}

/** The only read that returns the password hash, for the login check */
export const findByUsernameWithHash = async (
  username: string
): Promise<(IUser & { passwordHash: string }) | undefined> => {
  const [row] = await db
    .select({ ...userColumns, passwordHash: usersTable.passwordHash })
    .from(usersTable)
    .where(eq(usersTable.username, username))
  return row ? { ...toUser(row), passwordHash: row.passwordHash } : undefined
}
