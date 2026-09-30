import { randomBytes } from 'crypto'
import { readFileSync } from 'fs'
import path from 'path'
import { parse } from 'dotenv'
import { ZodError } from 'zod'
import { parseEnv } from '../config/env'
import { emailVerificationStartupWarning } from '../services/mapEmailVerification.service'

const ALPHANUMERIC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'

// Mirrors the production secrets: 64 random alphanumerics (~41 distinct chars)
// and 64 random hex digits.
function randomJwtSecret(length = 64): string {
  return Array.from(randomBytes(length), byte => ALPHANUMERIC[byte % ALPHANUMERIC.length]).join('')
}

function randomEncryptionKey(): string {
  return randomBytes(32).toString('hex')
}

function productionEnv(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    NODE_ENV:         'production',
    JWT_SECRET:       randomJwtSecret(),
    JWT_EXPIRES_IN:   '7d',
    ENCRYPTION_KEY:   randomEncryptionKey(),
    GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
    APPLE_CLIENT_ID:  '',
    REDIS_URL:        'redis://redis:6379',
    CORS_ORIGINS:     'https://mykoshermap.com,https://crm.mykoshermap.com',
    ...overrides,
  }
}

function rejectionOf(source: Record<string, string>): ZodError {
  try {
    parseEnv(source)
  } catch (error) {
    if (error instanceof ZodError) return error
    throw error
  }
  throw new Error('parseEnv accepted the configuration')
}

function expectRejected(
  variable: 'JWT_SECRET' | 'MAP_JWT_SECRET' | 'ENCRYPTION_KEY',
  value: string,
  overrides: Record<string, string> = {},
): void {
  const error = rejectionOf(productionEnv({ ...overrides, [variable]: value }))
  expect(error.issues.map(issue => issue.path.join('.'))).toContain(variable)
  // The startup error must never echo the secret it rejected.
  expect(error.message).not.toContain(value)
}

const PLACEHOLDERS = [
  'change-me', 'CHANGEME', 'CHANGE_ME', 'change me', 'replace-with', 'Replace_With', 'replacewith',
  'your-secret', 'your_secret', 'YOUR_JWT_SECRET', 'SECRET-KEY', 'secret_key', 'secretkey',
  'super_secret', 'at-least', 'placeholder', 'example',
]

describe('parseEnv secret validation', () => {
  it('accepts the production shape', () => {
    const source = productionEnv()
    const env = parseEnv(source)
    expect(env.JWT_SECRET).toBe(source.JWT_SECRET)
    expect(env.ENCRYPTION_KEY).toBe(source.ENCRYPTION_KEY)
    expect(env.NODE_ENV).toBe('production')
  })

  it('accepts secrets from the documented generators', () => {
    for (let i = 0; i < 100; i += 1) {
      expect(() => parseEnv(productionEnv({
        JWT_SECRET:     randomBytes(48).toString('hex'),
        ENCRYPTION_KEY: randomBytes(32).toString('hex').toUpperCase(),
      }))).not.toThrow()
      expect(() => parseEnv(productionEnv({ JWT_SECRET: randomBytes(48).toString('base64url') }))).not.toThrow()
    }
  })

  it.each(PLACEHOLDERS)('rejects a JWT_SECRET containing the placeholder %s', placeholder => {
    expectRejected('JWT_SECRET', `${randomJwtSecret(20)}${placeholder}${randomJwtSecret(20)}`)
  })

  it.each([
    'CHANGE_ME_TO_SOMETHING_RANDOM_AND_LONG_12345',
    'your_jwt_secret_key_here_change_in_production',
    'your_secret_here_at_least_32_characters_long',
    'my_super_secret_key_for_jwt_signing_2024_prod',
    'supersecretjwtkeythatisatleast32characterslong',
    // The old CI literals, which were once committed to the repository.
    'test-secret-must-be-at-least-32-chars-long',
    'ci-jwt-secret-must-be-at-least-32-chars',
  ])('rejects the common template JWT_SECRET %s', value => {
    expectRejected('JWT_SECRET', value)
  })

  it.each([
    ['fewer than 32 characters', randomJwtSecret(31)],
    ['fewer than 12 distinct characters', `${'abcdefghijk'.repeat(3)}kjihgfedcba`],
    ['one repeated character', 'x'.repeat(64)],
    ['a repeated pattern', '0123456789abcdefghijklmnopqrstuv'.repeat(2)],
  ])('rejects a JWT_SECRET with %s', (_label, value) => {
    expectRejected('JWT_SECRET', value)
  })

  it.each([
    ['0123456789abcdef repeated', '0123456789abcdef'.repeat(4)],
    ['0123456789ABCDEF repeated', '0123456789ABCDEF'.repeat(4)],
    ['one repeated character', 'a'.repeat(64)],
    ['all zeros', '0'.repeat(64)],
    ['fewer than 8 distinct digits', `${'0123456'.repeat(8)}65432106`],
    ['a short repeated block', 'deadbeef'.repeat(8)],
    ['the template with its last digit edited', `${'0123456789abcdef'.repeat(4).slice(0, 63)}e`],
    ['the template with its first digit edited', `1${'0123456789abcdef'.repeat(4).slice(1)}`],
    ['a repeated block with one digit edited', `${'deadbeef'.repeat(7)}deadbeee`],
    ['sequential bytes 00 01 02 …', Array.from({ length: 32 }, (_, i) => i.toString(16).padStart(2, '0')).join('')],
    ['descending bytes ff fe fd …', Array.from({ length: 32 }, (_, i) => (255 - i).toString(16).padStart(2, '0')).join('')],
    ['random digits around an ascending run', `${randomEncryptionKey().slice(0, 24)}0123456789abcdef${randomEncryptionKey().slice(0, 24)}`],
    ['random digits around a descending run', `${randomEncryptionKey().slice(0, 28)}fedcba98${randomEncryptionKey().slice(0, 28)}`],
    ['a replace-with placeholder', 'replace-with-64-hex-chars'],
    ['an upper-case placeholder', 'REPLACE_WITH_RANDOM_64_CHAR_HEX'],
    ['a non-hex value', `${randomEncryptionKey().slice(0, 63)}g`],
    ['the wrong length', randomEncryptionKey().slice(0, 62)],
  ])('rejects an ENCRYPTION_KEY that is %s', (_label, value) => {
    expectRejected('ENCRYPTION_KEY', value)
  })
})

describe('MAP_JWT_SECRET', () => {
  function variablesRejected(source: Record<string, string>): string[] {
    return rejectionOf(source).issues.map(issue => issue.path.join('.'))
  }

  it('is unset by default, which keeps map keys on JWT_SECRET', () => {
    expect(parseEnv(productionEnv()).MAP_JWT_SECRET).toBeUndefined()
  })

  // docker-compose passes an unset optional variable as ${VAR:-}, i.e. ''.
  it.each(['', '  '])('treats the empty value %j as unset', value => {
    expect(parseEnv(productionEnv({ MAP_JWT_SECRET: value })).MAP_JWT_SECRET).toBeUndefined()
  })

  it('accepts secrets from the documented generators', () => {
    for (let i = 0; i < 100; i += 1) {
      const hex = randomBytes(48).toString('hex')              // openssl rand -hex 48
      expect(parseEnv(productionEnv({ MAP_JWT_SECRET: hex })).MAP_JWT_SECRET).toBe(hex)
      const alphanumeric = randomJwtSecret()
      expect(parseEnv(productionEnv({ MAP_JWT_SECRET: alphanumeric })).MAP_JWT_SECRET).toBe(alphanumeric)
    }
  })

  it('does not change how JWT_SECRET is read', () => {
    const source = productionEnv({ MAP_JWT_SECRET: randomBytes(48).toString('hex') })
    expect(parseEnv(source).JWT_SECRET).toBe(source.JWT_SECRET)
  })

  it.each([
    ['equal to JWT_SECRET', (jwtSecret: string) => jwtSecret],
    ['JWT_SECRET with surrounding spaces', (jwtSecret: string) => ` ${jwtSecret} `],
    ['JWT_SECRET with a suffix', (jwtSecret: string) => `${jwtSecret}-map`],
    ['JWT_SECRET with a prefix', (jwtSecret: string) => `map${jwtSecret}`],
    ['a part of JWT_SECRET', (jwtSecret: string) => jwtSecret.slice(8, 48)],
  ])('rejects a MAP_JWT_SECRET %s', (_label, derive) => {
    const jwtSecret = randomJwtSecret()
    const value = derive(jwtSecret)
    expectRejected('MAP_JWT_SECRET', value, { JWT_SECRET: jwtSecret })
    // JWT_SECRET itself is fine; only the copy is refused.
    expect(new Set(variablesRejected(productionEnv({ JWT_SECRET: jwtSecret, MAP_JWT_SECRET: value }))))
      .toEqual(new Set(['MAP_JWT_SECRET']))
  })

  it.each(PLACEHOLDERS)('rejects a MAP_JWT_SECRET containing the placeholder %s', placeholder => {
    expectRejected('MAP_JWT_SECRET', `${randomJwtSecret(20)}${placeholder}${randomJwtSecret(20)}`)
  })

  it.each([
    ['fewer than 32 characters', randomJwtSecret(31)],
    ['fewer than 12 distinct characters', `${'abcdefghijk'.repeat(3)}kjihgfedcba`],
    ['one repeated character', 'x'.repeat(64)],
    ['a repeated pattern', '0123456789abcdefghijklmnopqrstuv'.repeat(2)],
    ['a template value', 'replace-with-openssl-rand-hex-48'],
  ])('rejects a MAP_JWT_SECRET with %s', (_label, value) => {
    expectRejected('MAP_JWT_SECRET', value)
    expect(new Set(variablesRejected(productionEnv({ MAP_JWT_SECRET: value })))).toEqual(new Set(['MAP_JWT_SECRET']))
  })
})

describe('parseEnv session lifetimes and cookies', () => {
  function variablesRejected(source: Record<string, string>): string[] {
    return rejectionOf(source).issues.map(issue => issue.path.join('.'))
  }

  it('defaults to 15-minute access tokens, 30-day refresh tokens and Secure cookies in production', () => {
    const { JWT_EXPIRES_IN: _ignored, ...withoutLegacy } = productionEnv()
    const env = parseEnv(withoutLegacy)
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60)
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30)
    expect(env.COOKIE_SECURE).toBe(true)
    expect(env.JWT_EXPIRES_IN_IGNORED).toBe(false)
  })

  it('no longer lets JWT_EXPIRES_IN set the session length, and flags it for a warning', () => {
    const env = parseEnv(productionEnv({ JWT_EXPIRES_IN: '7d' }))
    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(15 * 60)
    expect(env.JWT_EXPIRES_IN_IGNORED).toBe(true)
    expect(env).not.toHaveProperty('JWT_EXPIRES_IN')
    expect(parseEnv(productionEnv({ JWT_EXPIRES_IN: '' })).JWT_EXPIRES_IN_IGNORED).toBe(false)
  })

  it.each([
    ['15m', 900], ['1m', 60], ['60s', 60], ['900s', 900], ['1h', 3600], ['60m', 3600], [' 30m ', 1800], ['', 900],
  ])('accepts ACCESS_TOKEN_TTL=%p as %i seconds', (value, seconds) => {
    expect(parseEnv(productionEnv({ ACCESS_TOKEN_TTL: value })).ACCESS_TOKEN_TTL_SECONDS).toBe(seconds)
  })

  it.each(['7d', '2h', '61m', '59s', '0m', '900', '15 m', '15min', '-5m', 'abc'])(
    'rejects ACCESS_TOKEN_TTL=%p',
    value => {
      expect(variablesRejected(productionEnv({ ACCESS_TOKEN_TTL: value }))).toEqual(['ACCESS_TOKEN_TTL'])
    },
  )

  it.each([['7', 7], ['365', 365], ['', 30]])('accepts REFRESH_TOKEN_TTL_DAYS=%p', (value, days) => {
    expect(parseEnv(productionEnv({ REFRESH_TOKEN_TTL_DAYS: value })).REFRESH_TOKEN_TTL_DAYS).toBe(days)
  })

  it.each(['0', '366', '1.5', 'week'])('rejects REFRESH_TOKEN_TTL_DAYS=%p', value => {
    expect(variablesRejected(productionEnv({ REFRESH_TOKEN_TTL_DAYS: value }))).toEqual(['REFRESH_TOKEN_TTL_DAYS'])
  })

  it.each([
    ['production', undefined, true],
    ['development', undefined, false],
    ['test', undefined, false],
    ['production', '', true],
    ['production', 'false', false],
    ['development', 'true', true],
  ] as const)('NODE_ENV=%s with COOKIE_SECURE=%p gives Secure=%p', (nodeEnv, value, secure) => {
    const source = productionEnv({ NODE_ENV: nodeEnv, ...(value === undefined ? {} : { COOKIE_SECURE: value }) })
    expect(parseEnv(source).COOKIE_SECURE).toBe(secure)
  })

  it('rejects a COOKIE_SECURE that is not true or false', () => {
    expect(variablesRejected(productionEnv({ COOKIE_SECURE: 'yes' }))).toEqual(['COOKIE_SECURE'])
  })
})

describe('placeholders shipped in the .env templates', () => {
  const repoRoot = path.resolve(__dirname, '..', '..', '..')
  const templates = ['.env.example', '.env.hetzner.example', path.join('kasrut-api', '.env.example')]

  const cases = templates.flatMap(template => {
    const values = parse(readFileSync(path.join(repoRoot, template)))
    return (['JWT_SECRET', 'ENCRYPTION_KEY'] as const).map(variable => {
      const value = values[variable]
      if (!value) throw new Error(`${template} no longer defines ${variable}`)
      return [template, variable, value] as const
    })
  })

  it.each(cases)('%s: %s placeholder is rejected', (_template, variable, value) => {
    expectRejected(variable, value)
  })

  // Production is meant to run with a separate map secret, so the Hetzner
  // template asks for one; the API refuses the copied placeholder.
  it('.env.hetzner.example asks for a MAP_JWT_SECRET the API refuses until replaced', () => {
    const value = parse(readFileSync(path.join(repoRoot, '.env.hetzner.example'))).MAP_JWT_SECRET
    expect(value).toEqual(expect.any(String))
    expectRejected('MAP_JWT_SECRET', value as string)
  })

  // Local development runs without one (map keys come from JWT_SECRET).
  it.each(['.env.example', path.join('kasrut-api', '.env.example')])('%s leaves MAP_JWT_SECRET unset', template => {
    const value = parse(readFileSync(path.join(repoRoot, template))).MAP_JWT_SECRET
    expect(value ?? '').toBe('')
  })
})

describe('REQUIRE_OWNER_2FA', () => {
  it('is on unless set', () => {
    expect(parseEnv(productionEnv()).REQUIRE_OWNER_2FA).toBe(true)
  })

  // docker-compose passes an unset optional variable as ${VAR:-}, i.e. ''.
  it.each(['', '  '])('treats the empty value %j as unset', value => {
    expect(parseEnv(productionEnv({ REQUIRE_OWNER_2FA: value })).REQUIRE_OWNER_2FA).toBe(true)
  })

  it.each([['true', true], ['false', false]] as const)('parses %s', (value, expected) => {
    expect(parseEnv(productionEnv({ REQUIRE_OWNER_2FA: value })).REQUIRE_OWNER_2FA).toBe(expected)
  })

  it('rejects anything but true or false', () => {
    const error = rejectionOf(productionEnv({ REQUIRE_OWNER_2FA: 'yes' }))
    expect(error.issues.map(issue => issue.path.join('.'))).toContain('REQUIRE_OWNER_2FA')
  })

  it('is not switched off by the .env templates', () => {
    const repoRoot = path.resolve(__dirname, '..', '..', '..')
    for (const template of ['.env.example', '.env.hetzner.example', path.join('kasrut-api', '.env.example')]) {
      expect([undefined, 'true']).toContain(parse(readFileSync(path.join(repoRoot, template))).REQUIRE_OWNER_2FA)
    }
  })
})

describe('MAP_EMAIL_VERIFICATION', () => {
  const SMTP = { SMTP_HOST: 'smtp.example.org' }

  it('is required by default when a mail server is configured', () => {
    const env = parseEnv(productionEnv(SMTP))
    expect(env.SMTP_CONFIGURED).toBe(true)
    expect(env.MAP_EMAIL_VERIFICATION).toBe('required')
    expect(env.MAP_EMAIL_VERIFICATION_DEFAULTED_OFF).toBe(false)
  })

  // Production today: no SMTP_* at all, or passed through as empty values.
  it.each([[{}], [{ SMTP_HOST: '' }], [{ SMTP_HOST: '  ', MAP_EMAIL_VERIFICATION: '' }]])(
    'is off by default without a mail server (%j)',
    overrides => {
      const env = parseEnv(productionEnv(overrides))
      expect(env.SMTP_CONFIGURED).toBe(false)
      expect(env.MAP_EMAIL_VERIFICATION).toBe('off')
      expect(env.MAP_EMAIL_VERIFICATION_DEFAULTED_OFF).toBe(true)
    },
  )

  it.each([
    [{ ...SMTP, MAP_EMAIL_VERIFICATION: 'off' }, 'off'],
    [{ MAP_EMAIL_VERIFICATION: 'required' }, 'required'],
  ] as const)('honours an explicit setting (%j)', (overrides, mode) => {
    const env = parseEnv(productionEnv(overrides))
    expect(env.MAP_EMAIL_VERIFICATION).toBe(mode)
    expect(env.MAP_EMAIL_VERIFICATION_DEFAULTED_OFF).toBe(false)
  })

  it('rejects anything but required or off', () => {
    const error = rejectionOf(productionEnv({ MAP_EMAIL_VERIFICATION: 'true' }))
    expect(error.issues.map(issue => issue.path.join('.'))).toEqual(['MAP_EMAIL_VERIFICATION'])
  })

  describe('startup warning', () => {
    const warningFor = (overrides: Record<string, string>) => emailVerificationStartupWarning(parseEnv(productionEnv(overrides)))

    it('warns in production when verification is off for want of SMTP', () => {
      expect(warningFor({})).toMatch(/SMTP_HOST is not set: map email verification is off/)
    })

    it('warns when verification is required but no mail can be delivered', () => {
      expect(warningFor({ MAP_EMAIL_VERIFICATION: 'required' })).toMatch(/cannot be delivered/)
    })

    it.each([
      [{ SMTP_HOST: 'smtp.example.org' }],
      [{ MAP_EMAIL_VERIFICATION: 'off' }],
      [{ NODE_ENV: 'development' }],
    ])('stays quiet for %j', overrides => {
      expect(warningFor(overrides)).toBeNull()
    })
  })
})

describe('MAP_PUBLIC_URL', () => {
  it.each([
    [undefined, 'https://mykoshermap.com'],
    ['', 'https://mykoshermap.com'],
    ['https://staging.mykoshermap.com/', 'https://staging.mykoshermap.com'],
    ['http://localhost:5174', 'http://localhost:5174'],
  ])('%p gives %p', (value, expected) => {
    const source = productionEnv(value === undefined ? {} : { MAP_PUBLIC_URL: value })
    expect(parseEnv(source).MAP_PUBLIC_URL).toBe(expected)
  })

  it.each(['mykoshermap.com', 'javascript:alert(1)', 'ftp://mykoshermap.com'])('rejects %p', value => {
    const error = rejectionOf(productionEnv({ MAP_PUBLIC_URL: value }))
    expect(new Set(error.issues.map(issue => issue.path.join('.')))).toEqual(new Set(['MAP_PUBLIC_URL']))
  })
})

// docker-compose.yml is what production actually runs: every optional
// variable reaches the API as ${VAR:-default}, i.e. '' when the env file
// leaves it out.
describe('docker-compose.yml api environment', () => {
  const compose = readFileSync(path.resolve(__dirname, '..', '..', '..', 'docker-compose.yml'), 'utf8')
  const apiBlock = compose.slice(compose.indexOf('\n  api:'), compose.indexOf('\n  kasrut-map:'))
  // KEY: ${KEY:-default} or ${KEY:?message}
  const forwarded = new Map(
    [...apiBlock.matchAll(/^ {6}([A-Z0-9_]+):\s+\$\{\1:([-?])([^}]*)\}\s*$/gm)]
      .map(([, key, kind, rest]) => [key, kind === '-' ? rest : undefined] as const),
  )

  it.each([
    ['ACCESS_TOKEN_TTL', ''], ['REFRESH_TOKEN_TTL_DAYS', ''], ['COOKIE_SECURE', ''],
    ['REQUIRE_OWNER_2FA', 'true'], ['MAP_JWT_SECRET', ''],
    ['SMTP_HOST', ''], ['SMTP_PORT', ''], ['SMTP_USER', ''], ['SMTP_PASS', ''],
    ['MAP_EMAIL_VERIFICATION', ''], ['MAP_PUBLIC_URL', ''],
  ])('forwards %s with default %j', (key, fallback) => {
    expect(forwarded.has(key)).toBe(true)
    expect(forwarded.get(key)).toBe(fallback)
  })

  it('no longer passes JWT_EXPIRES_IN', () => {
    expect(apiBlock).not.toMatch(/^\s+JWT_EXPIRES_IN:/m)
  })

  it('starts on the intended production defaults when the env file sets none of them', () => {
    const defaults = Object.fromEntries(
      [...forwarded].filter((entry): entry is [string, string] => entry[1] !== undefined),
    )
    const env = parseEnv(productionEnv({ ...defaults, NODE_ENV: 'production' }))

    expect(env.ACCESS_TOKEN_TTL_SECONDS).toBe(900)
    expect(env.REFRESH_TOKEN_TTL_DAYS).toBe(30)
    expect(env.COOKIE_SECURE).toBe(true)
    expect(env.REQUIRE_OWNER_2FA).toBe(true)
    expect(env.SMTP_CONFIGURED).toBe(false)
    expect(env.MAP_EMAIL_VERIFICATION).toBe('off')
    expect(env.MAP_PUBLIC_URL).toBe('https://mykoshermap.com')
    expect(env.MAP_JWT_SECRET).toBeUndefined()
  })
})
