import { type Static, Type } from 'typebox'

/** Longest username accepted */
export const USERNAME_MAX_LENGTH = 64

/** A user as the API returns it; the password hash never leaves the database layer */
export const userSchema = Type.Object({
  id: Type.String({ format: 'uuid' }),
  username: Type.String({ maxLength: USERNAME_MAX_LENGTH }),
  createdAt: Type.String({ format: 'date-time' }),
})

/** A user as the API returns it */
export type IUser = Static<typeof userSchema>
