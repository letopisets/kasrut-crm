import { hkdfSync } from 'crypto'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'
import type { JwtPurpose } from '../lib/jwt'

// Re-derives the per-purpose signing keys independently of lib/jwt.ts
// (HKDF-SHA256, salt 'kashrut-jwt-v1', info 'kashrut:<purpose>', 32 bytes), so
// tests pin the derivation parameters and can mint correctly keyed tokens with
// claims the production helpers refuse to produce.
export function purposeKey(purpose: JwtPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', env.JWT_SECRET, 'kashrut-jwt-v1', `kashrut:${purpose}`, 32))
}

export function signWithPurposeKey(purpose: JwtPurpose, payload: object, options: SignOptions = {}): string {
  return jwt.sign(payload, purposeKey(purpose), {
    algorithm: 'HS256',
    issuer:    'kashrut-api',
    audience:  purpose,
    expiresIn: '1h',
    ...options,
  })
}
