import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto'

/** scrypt cost settings, as `node:crypto` takes them */
type ScryptCost = { N: number; r: number; p: number }

/**
 * Cost of every new hash: 16 MiB and five passes, which OWASP lists as equal
 * in strength to N=2^17 with an eighth of the memory, so parallel logins fit
 * a small VM. About 0.2 s per hash.
 */
const COST: ScryptCost = { N: 2 ** 14, r: 8, p: 5 }

/** Length of the derived key, in bytes */
const KEY_LENGTH = 64

/**
 * A hash no password matches, checked when the username does not exist, so
 * that the login takes as long as a real one
 */
const NO_USER_HASH = [
  'scrypt',
  COST.N,
  COST.r,
  COST.p,
  Buffer.alloc(16).toString('base64'),
  Buffer.alloc(KEY_LENGTH).toString('base64'),
].join('$')

/** The scrypt key of a password, off the main thread */
const deriveKey = (password: string, salt: Buffer, cost: ScryptCost) =>
  new Promise<Buffer>((resolve, reject) =>
    scrypt(password, salt, KEY_LENGTH, cost, (error, key) =>
      error ? reject(error) : resolve(key)
    )
  )

/**
 * Hashes a password with a random salt as `scrypt$N$r$p$salt$key`. The cost
 * is stored in the hash, so raising it later still verifies older hashes.
 */
export const hashPassword = async (password: string): Promise<string> => {
  const salt = randomBytes(16)
  const key = await deriveKey(password, salt, COST)
  return [
    'scrypt',
    COST.N,
    COST.r,
    COST.p,
    salt.toString('base64'),
    key.toString('base64'),
  ].join('$')
}

/**
 * Whether a password matches a hash, compared in constant time. Without a hash
 * (an unknown username) it still derives a key and answers false, so the
 * response time does not reveal which accounts exist.
 */
export const verifyPassword = async (
  password: string,
  hash: string | undefined
): Promise<boolean> => {
  const [, N, r, p, salt, key] = (hash ?? NO_USER_HASH).split('$')
  const derived = await deriveKey(password, Buffer.from(salt, 'base64'), {
    N: Number(N),
    r: Number(r),
    p: Number(p),
  })
  return (
    hash !== undefined && timingSafeEqual(derived, Buffer.from(key, 'base64'))
  )
}
