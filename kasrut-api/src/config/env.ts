import 'dotenv/config'
import { z } from 'zod'
import type { SignOptions } from 'jsonwebtoken'

type JwtExpiresIn = SignOptions['expiresIn']

const DEFAULT_CORS = 'http://localhost:5173,http://localhost:5174,http://127.0.0.1:5173,http://127.0.0.1:5174'

// Template values from the .env examples and the usual copy-paste placeholders,
// in hyphen, underscore, space or run-together spelling. Starting with one of
// them would make every signed token forgeable.
const PLACEHOLDER_SECRET = new RegExp([
  'change[-_ ]?me', 'replace[-_ ]?with', 'your[-_ ]?(jwt[-_ ]?)?secret', 'secret[-_ ]?key',
  'super[-_ ]?secret', 'at[-_ ]?least', 'placeholder', 'example',
].join('|'), 'i')

function distinctChars(value: string): number {
  return new Set(value).size
}

// Some shift of up to 32 characters leaves at least 3/4 of the string in place:
// exact repeats ("abcabc…", "0123…cdef0123…") and lightly edited ones
// ("0123…abcdee"). A random secret gets nowhere near that.
function isNearlyPeriodic(value: string): boolean {
  for (let period = 1; period <= Math.min(32, value.length / 2); period += 1) {
    let same = 0
    for (let i = period; i < value.length; i += 1) {
      if (value[i] === value[i - period]) same += 1
    }
    if (same >= 0.75 * (value.length - period)) return true
  }
  return false
}

// "01234567…" / "fedcba98…": eight or more hex digits counting up or down.
function hasHexRun(hex: string, length = 8): boolean {
  const digits = Array.from(hex, digit => parseInt(digit, 16))
  let run = 1
  for (let i = 1; i < digits.length; i += 1) {
    const step = digits[i] - digits[i - 1]
    const previousStep = i > 1 ? digits[i - 1] - digits[i - 2] : 0
    run = step === 1 || step === -1 ? (step === previousStep ? run + 1 : 2) : 1
    if (run >= length) return true
  }
  return false
}

// 000102…1f, 00000…, ff fe fd…: every byte is the previous one plus a constant.
function isByteSequence(hex: string): boolean {
  const bytes = Buffer.from(hex, 'hex')
  if (bytes.length < 2) return false
  const step = (bytes[1] - bytes[0] + 256) % 256
  return bytes.every((byte, i) => i === 0 || (byte - bytes[i - 1] + 256) % 256 === step)
}

const jwtSecret = z.string()
  .min(32, 'JWT_SECRET must be at least 32 characters long')
  .refine(value => !PLACEHOLDER_SECRET.test(value), 'JWT_SECRET is a placeholder; generate a random secret')
  .refine(value => distinctChars(value) >= 12, 'JWT_SECRET must contain at least 12 distinct characters')
  .refine(value => !isNearlyPeriodic(value), 'JWT_SECRET must not be a repeated pattern')

const encryptionKey = z.string()
  .regex(/^[0-9a-fA-F]{64}$/, 'ENCRYPTION_KEY must be a 64-character hex string (32 bytes)')
  .refine(value => !PLACEHOLDER_SECRET.test(value), 'ENCRYPTION_KEY is a placeholder; generate a random key')
  .refine(value => distinctChars(value.toLowerCase()) >= 8, 'ENCRYPTION_KEY must contain at least 8 distinct hex digits')
  .refine(
    value => {
      const hex = value.toLowerCase()
      return !isNearlyPeriodic(hex) && !hasHexRun(hex) && !isByteSequence(hex)
    },
    'ENCRYPTION_KEY must not be a pattern such as 0123456789abcdef… or 000102…; generate a random key',
  )

export const envSchema = z.object({
  // Fail closed when the deployment forgets to set NODE_ENV. Development-only
  // behaviour must always be enabled explicitly rather than inferred from
  // "not production".
  NODE_ENV:          z.enum(['production', 'development', 'test']).default('production'),
  PORT:             z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL:   z.string().min(1).default('https://api.mykoshermap.com/api'),
  JWT_SECRET:       jwtSecret,
  JWT_EXPIRES_IN:   z.string().default('7d'),
  ENCRYPTION_KEY:   encryptionKey,
  GOOGLE_CLIENT_ID: z.string().default(''),
  APPLE_CLIENT_ID:  z.string().default(''),
  REDIS_URL:        z.string().min(1).default('redis://localhost:6379'),
  // Accept either CORS_ORIGINS or the legacy CORS_ORIGIN (singular)
  CORS_ORIGINS:     z.string().optional(),
  CORS_ORIGIN:      z.string().optional(),
  EXPOSE_DEV_RESET_TOKEN: z.enum(['true', 'false']).default('false')
    .transform(value => value === 'true'),
  // Owners are global admins: while on, an owner without 2FA can do nothing
  // but finish 2FA setup, and cannot switch 2FA off.
  // An empty value counts as unset: docker-compose passes optional variables
  // as ${VAR:-}, and that must not stop the API from starting.
  REQUIRE_OWNER_2FA: z.preprocess(
    value => (typeof value === 'string' && value.trim() === '' ? undefined : value),
    z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  ),
})

// Pure so tests can check a configuration without mutating process.env.
// Throws a ZodError that names the offending variable, never its value.
export function parseEnv(source: Record<string, string | undefined>) {
  const raw = envSchema.parse(source)
  return {
    NODE_ENV:          raw.NODE_ENV,
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
    EXPOSE_DEV_RESET_TOKEN: raw.EXPOSE_DEV_RESET_TOKEN,
    REQUIRE_OWNER_2FA: raw.REQUIRE_OWNER_2FA,
  } as const
}

export const env = parseEnv(process.env)
