import 'dotenv/config'
import type { SignOptions } from 'jsonwebtoken'

const defaultCorsOrigins = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'
const corsOrigins = process.env.CORS_ORIGINS ?? process.env.CORS_ORIGIN ?? defaultCorsOrigins
const jwtSecret   = process.env.JWT_SECRET ?? ''

if (!jwtSecret || jwtSecret.length < 32) {
  throw new Error('JWT_SECRET must be set and at least 32 characters long')
}

const encryptionKey = process.env.ENCRYPTION_KEY ?? ''
if (!encryptionKey || encryptionKey.length !== 64) {
  throw new Error('ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
}

// jsonwebtoken's `expiresIn` is `number | StringValue` and a plain `string` no
// longer fits without a cast. Typing the env value once here lets every call
// site sign tokens without `as object` workarounds.
type JwtExpiresIn = SignOptions['expiresIn']

export const env = {
  PORT:           parseInt(process.env.PORT ?? '3000', 10),
  API_PUBLIC_URL: process.env.API_PUBLIC_URL ?? 'https://api.mykoshermap.com/api',
  JWT_SECRET:     jwtSecret,
  JWT_EXPIRES_IN: (process.env.JWT_EXPIRES_IN ?? '7d') as JwtExpiresIn,
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID ?? '',
  APPLE_CLIENT_ID:  process.env.APPLE_CLIENT_ID  ?? '',
  CORS_ORIGINS:   corsOrigins.split(',').map(s => s.trim()),
  REDIS_URL:      process.env.REDIS_URL ?? 'redis://localhost:6379',
} as const
