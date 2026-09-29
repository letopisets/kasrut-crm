import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'

const PASSWORD_HASH_ROUNDS = 12
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

// Hash (cost PASSWORD_HASH_ROUNDS) of a random value nobody knows. Accounts
// without a password (unknown email, OAuth-only) are compared against it so
// they cost the same bcrypt time as a wrong password; the result is ignored.
export const DUMMY_PASSWORD_HASH = '$2a$12$SBGhhsdUS6dBzLBMkbeAoe/XTRFdGsPXPwjWthtpqJzxYnGVcbN22'

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

export function normalizePhone(phone: string): string {
  return phone.replace(/[\s().-]/g, '').trim()
}

export function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, PASSWORD_HASH_ROUNDS)
}

export async function verifyPassword(password: string, passwordHash: string | null | undefined): Promise<boolean> {
  if (passwordHash) return bcrypt.compare(password, passwordHash)
  await bcrypt.compare(password, DUMMY_PASSWORD_HASH)
  return false
}

export function createPasswordResetToken(): string {
  return randomBytes(32).toString('base64url')
}

export function hashPasswordResetToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

export function getPasswordResetExpiry(): Date {
  return new Date(Date.now() + RESET_TOKEN_TTL_MS)
}
