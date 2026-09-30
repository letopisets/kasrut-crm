import 'dotenv/config'
import { z } from 'zod'

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

// Access-token lifetime: a whole number of seconds, minutes or hours ("15m"),
// between one minute and one hour. The refresh cookie keeps the session alive,
// so anything longer only widens the window of a stolen access token. A bare
// number is refused: jsonwebtoken would read "900" as 900 milliseconds.
const ACCESS_TOKEN_TTL_UNITS = { s: 1, m: 60, h: 3600 } as const
const ACCESS_TOKEN_TTL_MIN_SEC = 60
const ACCESS_TOKEN_TTL_MAX_SEC = 60 * 60

function accessTokenTtlSeconds(value: string): number | null {
  const match = /^([1-9]\d{0,5})(s|m|h)$/.exec(value.trim())
  if (!match) return null
  return Number(match[1]) * ACCESS_TOKEN_TTL_UNITS[match[2] as keyof typeof ACCESS_TOKEN_TTL_UNITS]
}

const accessTokenTtl = z.string()
  .refine(
    value => {
      const seconds = accessTokenTtlSeconds(value)
      return seconds !== null && seconds >= ACCESS_TOKEN_TTL_MIN_SEC && seconds <= ACCESS_TOKEN_TTL_MAX_SEC
    },
    'ACCESS_TOKEN_TTL must look like 15m, 900s or 1h and lie between 1 minute and 1 hour',
  )
  .transform(value => accessTokenTtlSeconds(value) as number)

// docker-compose passes optional variables as ${VAR:-}; an empty value must
// count as unset rather than stop the API from starting.
function emptyAsUnset<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(value => (typeof value === 'string' && value.trim() === '' ? undefined : value), schema)
}

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

// Base URL of the public map; the email verification link points here.
const mapPublicUrl = z.string()
  .url('MAP_PUBLIC_URL must be an absolute URL such as https://mykoshermap.com')
  .refine(value => /^https?:\/\//i.test(value), 'MAP_PUBLIC_URL must start with https:// or http://')
  .transform(value => value.replace(/\/+$/, ''))

export const envSchema = z.object({
  // Fail closed when the deployment forgets to set NODE_ENV. Development-only
  // behaviour must always be enabled explicitly rather than inferred from
  // "not production".
  NODE_ENV:          z.enum(['production', 'development', 'test']).default('production'),
  PORT:             z.coerce.number().int().positive().default(3000),
  API_PUBLIC_URL:   z.string().min(1).default('https://api.mykoshermap.com/api'),
  JWT_SECRET:       jwtSecret,
  // Lifetime of CRM and map access tokens. JWT_EXPIRES_IN is no longer read
  // (see parseEnv); sessions outlive an access token through the refresh cookie.
  ACCESS_TOKEN_TTL: emptyAsUnset(accessTokenTtl.default('15m')),
  // A sign-in can be renewed through the refresh cookie for this many days;
  // rotation does not extend it, so every session ends after this long.
  REFRESH_TOKEN_TTL_DAYS: emptyAsUnset(z.coerce.number().int().min(1).max(365).default(30)),
  // Secure attribute of the refresh cookies. Defaults to true except in
  // development and test, which usually run over plain http.
  COOKIE_SECURE: emptyAsUnset(z.enum(['true', 'false']).optional()),
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
  REQUIRE_OWNER_2FA: emptyAsUnset(
    z.enum(['true', 'false']).default('true').transform(value => value === 'true'),
  ),
  // 'required': password-registered map users must follow the emailed link
  // before they can post reviews or suggestions. Unset, it follows SMTP_HOST
  // (see parseEnv): without a mail server nobody could ever verify.
  MAP_EMAIL_VERIFICATION: emptyAsUnset(z.enum(['required', 'off']).optional()),
  MAP_PUBLIC_URL: emptyAsUnset(mapPublicUrl.default('https://mykoshermap.com')),
})

// Pure so tests can check a configuration without mutating process.env.
// Throws a ZodError that names the offending variable, never its value.
export function parseEnv(source: Record<string, string | undefined>) {
  const raw = envSchema.parse(source)
  // The mailer reads the SMTP_* variables itself; only whether a server is
  // configured matters here.
  const smtpConfigured = (source.SMTP_HOST ?? '').trim() !== ''
  return {
    NODE_ENV:          raw.NODE_ENV,
    PORT:             raw.PORT,
    API_PUBLIC_URL:   raw.API_PUBLIC_URL,
    JWT_SECRET:       raw.JWT_SECRET,
    ACCESS_TOKEN_TTL_SECONDS: raw.ACCESS_TOKEN_TTL,
    REFRESH_TOKEN_TTL_DAYS:   raw.REFRESH_TOKEN_TTL_DAYS,
    COOKIE_SECURE: raw.COOKIE_SECURE === undefined
      ? raw.NODE_ENV === 'production'
      : raw.COOKIE_SECURE === 'true',
    // Still set by older .env files and docker-compose (7d in production).
    // Ignored: lib/jwt.ts logs a warning once so the stale value gets removed.
    JWT_EXPIRES_IN_IGNORED: (source.JWT_EXPIRES_IN ?? '').trim() !== '',
    ENCRYPTION_KEY:   raw.ENCRYPTION_KEY,
    GOOGLE_CLIENT_ID: raw.GOOGLE_CLIENT_ID,
    APPLE_CLIENT_ID:  raw.APPLE_CLIENT_ID,
    REDIS_URL:        raw.REDIS_URL,
    CORS_ORIGINS:     (raw.CORS_ORIGINS ?? raw.CORS_ORIGIN ?? DEFAULT_CORS)
                        .split(',').map(s => s.trim()).filter(Boolean),
    EXPOSE_DEV_RESET_TOKEN: raw.EXPOSE_DEV_RESET_TOKEN,
    REQUIRE_OWNER_2FA: raw.REQUIRE_OWNER_2FA,
    SMTP_CONFIGURED: smtpConfigured,
    MAP_EMAIL_VERIFICATION: raw.MAP_EMAIL_VERIFICATION ?? (smtpConfigured ? 'required' : 'off'),
    // Off only because no SMTP_HOST is set: mapEmailVerification.service.ts
    // warns at startup in production.
    MAP_EMAIL_VERIFICATION_DEFAULTED_OFF: raw.MAP_EMAIL_VERIFICATION === undefined && !smtpConfigured,
    MAP_PUBLIC_URL: raw.MAP_PUBLIC_URL,
  } as const
}

export const env = parseEnv(process.env)
