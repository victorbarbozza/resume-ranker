import { Type } from 'typebox'

import { USERNAME_MAX_LENGTH } from '@/server/shared/schemas/user.schema'

/** POST /api/auth/login: the username and password; a password is capped at 256 characters, since scrypt reads all of it */
export const loginBody = Type.Object(
  {
    username: Type.String({ minLength: 1, maxLength: USERNAME_MAX_LENGTH }),
    password: Type.String({ minLength: 1, maxLength: 256 }),
  },
  { additionalProperties: false }
)
