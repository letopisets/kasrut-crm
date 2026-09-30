import { createHash, randomBytes } from 'crypto'
import bcrypt from 'bcryptjs'
import { dummyPasswordCompare } from '../lib/dummyPassword'

const PASSWORD_HASH_ROUNDS = 12
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000

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
  return dummyPasswordCompare(password)
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
