import 'dotenv/config'
import { z } from 'zod'
import type { SignOptions } from 'jsonwebtoken'

type JwtExpiresIn = SignOptions['expiresIn']

const DEFAULT_CORS = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'

const schema = z.object({
  PORT:             z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL:   z.string().min(1).default('https://api.mykoshermap.com/api'),
  JWT_SECRET:       z.string().min(32, 'JWT_SECRET must be at least 32 characters long'),
  JWT_EXPIRES_IN:   z.string().default('7d'),
  ENCRYPTION_KEY:   z.string().length(64, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)'),
  GOOGLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID:  z.string().default(''),
  REDIS_URL:        z.string().min(1).default('redis://localhost:6379'),
  // Accept either CORS_ORIGINS or the legacy CORS_ORIGIN (singular)
  CORS_ORIGINS:     z.string().optional(),
  CORS_ORIGIN:      z.string().optional(),
})

const raw = schema.parse(process.env)

export const env = {
  PORT:             raw.PORT,
  API_PUBLIC_URL:   raw.API_PUBLIC_URL,
  JWT_SECRET:       raw.JWT_SECRET,
  JWT_EXPIRES_IN:   raw.JWT_EXPIRES_IN as JwtExpiresIn,
  ENCRYPTION_KEY:   raw.ENCRYPTION_KEY,
  GOOGLE_CLIENT_ID: raw.GOOGLE_CLIENT_ID,
  APPLE_CLIENT_ID:  raw.APPLE_CLIENT_ID,
  REDIS_URL:        raw.REDIS_URL,
  CORS_ORIGINS:     (raw.CORS_ORIGINS ?? raw.CORS_ORIGIN ?? DEFAULT_CORS)
                      .split(',').map(s => s.trim()).filter(Boolean),
} as const
