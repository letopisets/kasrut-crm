import { hkdfSync } from 'crypto'
import jwt, { type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'
import type { JwtPurpose } from '../lib/jwt'

// Re-derives the per-purpose signing keys independently of lib/jwt.ts
// (HKDF-SHA256, salt 'kashrut-jwt-v1', info 'kashrut:<purpose>', 32 bytes), so
// tests pin the derivation parameters and can mint correctly keyed tokens with
// claims the production helpers refuse to produce.
export function hkdfPurposeKey(secret: string, purpose: JwtPurpose): Buffer {
  return Buffer.from(hkdfSync('sha256', secret, 'kashrut-jwt-v1', `kashrut:${purpose}`, 32))
}

// The key the running configuration uses: map access from MAP_JWT_SECRET when
// set, everything else (and map access without it) from JWT_SECRET.
export function purposeKey(purpose: JwtPurpose): Buffer {
  const secret = purpose === 'map-access' ? env.MAP_JWT_SECRET ?? env.JWT_SECRET : env.JWT_SECRET
  return hkdfPurposeKey(secret, purpose)
}

export function signWithKey(key: Buffer, purpose: JwtPurpose, payload: object, options: SignOptions = {}): string {
  return jwt.sign(payload, key, {
    algorithm: 'HS256',
    issuer:    'kashrut-api',
    audience:  purpose,
    expiresIn: '1h',
    ...options,
  })
}

export function signWithPurposeKey(purpose: JwtPurpose, payload: object, options: SignOptions = {}): string {
  return signWithKey(purposeKey(purpose), purpose, payload, options)
}
