import { createHmac, generateKeyPairSync } from 'crypto'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import {
  signCrmAccessToken,
  signMapAccessToken,
  signTwoFactorPendingToken,
  verifyCrmAccessToken,
  verifyMapAccessToken,
  verifyTwoFactorPendingToken,
  type JwtPurpose,
} from '../lib/jwt'
import { purposeKey, signWithPurposeKey } from './jwtTestUtils'

const crmClaims = {
  sub: 'u1', role: 'rabbanut' as const, name: 'Admin', email: 'a@crm.il', rabbanutId: 'rb1', ver: 2,
}
const mapClaims = { sub: 'mu1', name: 'Map User', email: 'mu@pub.il', ver: 4 }

const verifiers: Record<JwtPurpose, (token: string) => unknown> = {
  'crm-access':  verifyCrmAccessToken,
  'map-access':  verifyMapAccessToken,
  '2fa-pending': verifyTwoFactorPendingToken,
}

const mint: Record<JwtPurpose, () => string> = {
  'crm-access':  () => signCrmAccessToken(crmClaims),
  'map-access':  () => signMapAccessToken(mapClaims),
  '2fa-pending': () => signTwoFactorPendingToken({ sub: 'u1' }),
}

// A structurally valid payload per purpose, used to show that only the
// key/algorithm/iss/aud under test makes a verifier reject.
const validPayload: Record<JwtPurpose, object> = {
  'crm-access':  { ...crmClaims, typ: 'crm', jti: 'j-crm' },
  'map-access':  { ...mapClaims, typ: 'map_user', jti: 'j-map' },
  '2fa-pending': { sub: 'u1', typ: '2fa_pending', jti: 'j-2fa' },
}

const purposes = Object.keys(verifiers) as JwtPurpose[]

function b64url(value: object | Buffer): string {
  return (Buffer.isBuffer(value) ? value : Buffer.from(JSON.stringify(value))).toString('base64url')
}

function claimsFor(purpose: JwtPurpose): object {
  const now = Math.floor(Date.now() / 1000)
  return { ...validPayload[purpose], iss: 'kashrut-api', aud: purpose, iat: now, exp: now + 3600 }
}

describe('per-purpose JWT signing keys', () => {
  it('round-trips each purpose through its own verifier', () => {
    expect(verifyCrmAccessToken(mint['crm-access']())).toMatchObject({
      ...crmClaims, typ: 'crm', jti: expect.any(String),
    })
    expect(verifyMapAccessToken(mint['map-access']())).toMatchObject({
      ...mapClaims, typ: 'map_user', jti: expect.any(String),
    })
    expect(verifyTwoFactorPendingToken(mint['2fa-pending']())).toMatchObject({
      sub: 'u1', typ: '2fa_pending', jti: expect.any(String), exp: expect.any(Number),
    })
  })

  describe('token lifetimes', () => {
    const lifetime = (token: string) => {
      const { iat, exp } = jwt.decode(token) as { iat: number; exp: number }
      return exp - iat
    }

    // The 15-minute default itself is pinned in env.test.ts.
    it('gives access tokens ACCESS_TOKEN_TTL and pre-2FA tokens 5 minutes', () => {
      expect(lifetime(mint['crm-access']())).toBe(env.ACCESS_TOKEN_TTL_SECONDS)
      expect(lifetime(mint['map-access']())).toBe(env.ACCESS_TOKEN_TTL_SECONDS)
      expect(lifetime(mint['2fa-pending']())).toBe(5 * 60)
    })

    it('warns once at startup when the ignored JWT_EXPIRES_IN is still set', () => {
      const previous = process.env.JWT_EXPIRES_IN
      process.env.JWT_EXPIRES_IN = '7d'
      try {
        jest.isolateModules(() => {
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const { logger } = require('../lib/logger') as typeof import('../lib/logger')
          const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
          // eslint-disable-next-line @typescript-eslint/no-require-imports
          const isolated = require('../lib/jwt') as typeof import('../lib/jwt')
          const { iat, exp } = jwt.decode(isolated.signCrmAccessToken(crmClaims)) as { iat: number; exp: number }

          expect(warn).toHaveBeenCalledTimes(1)
          expect(warn.mock.calls[0][0]).toMatch(/JWT_EXPIRES_IN is set but ignored/)
          expect(exp - iat).not.toBe(7 * 24 * 60 * 60)
        })
      } finally {
        if (previous === undefined) delete process.env.JWT_EXPIRES_IN
        else process.env.JWT_EXPIRES_IN = previous
      }
    })

    it('honours a configured ACCESS_TOKEN_TTL for CRM and map access tokens', () => {
      const ttl = jest.replaceProperty(env, 'ACCESS_TOKEN_TTL_SECONDS', 7 * 60)
      try {
        expect(lifetime(mint['crm-access']())).toBe(7 * 60)
        expect(lifetime(mint['map-access']())).toBe(7 * 60)
        expect(lifetime(mint['2fa-pending']())).toBe(5 * 60)
      } finally {
        ttl.restore()
      }
    })
  })

  it.each(purposes)('signs %s tokens with HS256, issuer kashrut-api and the HKDF-derived key', purpose => {
    const token = mint[purpose]()
    expect(jwt.decode(token, { complete: true })?.header.alg).toBe('HS256')
    expect(jwt.verify(token, purposeKey(purpose), { algorithms: ['HS256'] })).toMatchObject({
      iss: 'kashrut-api', aud: purpose,
    })
  })

  it('derives a distinct 32-byte key per purpose', () => {
    const keys = purposes.map(purpose => purposeKey(purpose))
    expect(keys.every(key => key.length === 32)).toBe(true)
    expect(new Set(keys.map(key => key.toString('hex'))).size).toBe(3)
  })

  const crossPurpose = purposes.flatMap(signedAs =>
    purposes.filter(verifiedAs => verifiedAs !== signedAs).map(verifiedAs => [signedAs, verifiedAs] as const))

  it.each(crossPurpose)('rejects a %s token in the %s verifier', (signedAs, verifiedAs) => {
    expect(() => verifiers[verifiedAs](mint[signedAs]())).toThrow()
  })

  it.each(crossPurpose)(
    'rejects a token signed with the %s key even when it claims the %s audience and typ',
    (signedWith, claimed) => {
      const forged = signWithPurposeKey(signedWith, validPayload[claimed], { audience: claimed })
      expect(() => verifiers[claimed](forged)).toThrow(/invalid signature/)
    },
  )
})

describe('legacy and forged tokens', () => {
  it.each(purposes)('rejects a %s token signed with the raw JWT_SECRET (old scheme)', purpose => {
    const legacy = jwt.sign(validPayload[purpose], env.JWT_SECRET, { expiresIn: '1h' })
    expect(() => verifiers[purpose](legacy)).toThrow()
  })

  it.each(purposes)('rejects a %s token signed with the raw JWT_SECRET even with the new iss/aud', purpose => {
    const legacy = jwt.sign(validPayload[purpose], env.JWT_SECRET, {
      algorithm: 'HS256', issuer: 'kashrut-api', audience: purpose, expiresIn: '1h',
    })
    expect(() => verifiers[purpose](legacy)).toThrow(/invalid signature/)
  })

  it.each(purposes)('rejects an unsigned alg=none %s token', purpose => {
    const unsigned = `${b64url({ alg: 'none', typ: 'JWT' })}.${b64url(claimsFor(purpose))}.`
    expect(() => verifiers[purpose](unsigned)).toThrow(/jwt signature is required/)
  })

  it.each(purposes)('rejects an HS512 %s token signed with the correct purpose key', purpose => {
    const token = signWithPurposeKey(purpose, validPayload[purpose], { algorithm: 'HS512' })
    expect(() => verifiers[purpose](token)).toThrow(/invalid algorithm/)
  })

  it.each(purposes)('rejects an RS256-header %s token HMAC-signed with the purpose key', purpose => {
    const signingInput = `${b64url({ alg: 'RS256', typ: 'JWT' })}.${b64url(claimsFor(purpose))}`
    const signature = createHmac('sha256', purposeKey(purpose)).update(signingInput).digest()
    expect(() => verifiers[purpose](`${signingInput}.${b64url(signature)}`)).toThrow(/invalid algorithm/)
  })

  it('rejects a genuinely RS256-signed token', () => {
    const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
    const token = jwt.sign(validPayload['crm-access'], privateKey, {
      algorithm: 'RS256', issuer: 'kashrut-api', audience: 'crm-access', expiresIn: '1h',
    })
    expect(() => verifyCrmAccessToken(token)).toThrow(/invalid algorithm/)
  })
})

describe('issuer, audience and claim checks', () => {
  it.each(purposes)('rejects a %s token with a wrong issuer', purpose => {
    const token = signWithPurposeKey(purpose, validPayload[purpose], { issuer: 'someone-else' })
    expect(() => verifiers[purpose](token)).toThrow(/jwt issuer invalid/)
  })

  it.each(purposes)('rejects a %s token without an issuer', purpose => {
    const token = jwt.sign(validPayload[purpose], purposeKey(purpose), {
      algorithm: 'HS256', audience: purpose, expiresIn: '1h',
    })
    expect(() => verifiers[purpose](token)).toThrow(/jwt issuer invalid/)
  })

  it.each(purposes)('rejects a %s token with a wrong audience', purpose => {
    const token = signWithPurposeKey(purpose, validPayload[purpose], { audience: 'kashrut-other' })
    expect(() => verifiers[purpose](token)).toThrow(/jwt audience invalid/)
  })

  it.each(purposes)('rejects a %s token without an audience', purpose => {
    const token = jwt.sign(validPayload[purpose], purposeKey(purpose), {
      algorithm: 'HS256', issuer: 'kashrut-api', expiresIn: '1h',
    })
    expect(() => verifiers[purpose](token)).toThrow(/jwt audience invalid/)
  })

  it.each(purposes)('rejects an expired %s token', purpose => {
    const token = signWithPurposeKey(purpose, validPayload[purpose], { expiresIn: -10 })
    expect(() => verifiers[purpose](token)).toThrow(/jwt expired/)
  })

  it.each(purposes)('rejects a %s token without an expiry', purpose => {
    const token = jwt.sign(validPayload[purpose], purposeKey(purpose), {
      algorithm: 'HS256', issuer: 'kashrut-api', audience: purpose,
    })
    expect(() => verifiers[purpose](token)).toThrow(/invalid token claims/)
  })

  it.each([
    ['crm-access', { ...validPayload['crm-access'], typ: undefined }],
    ['crm-access', { ...validPayload['crm-access'], typ: 'map_user' }],
    ['crm-access', { ...validPayload['crm-access'], role: undefined }],
    ['crm-access', { ...validPayload['crm-access'], ver: -1 }],
    ['map-access', { ...validPayload['map-access'], typ: 'crm' }],
    ['map-access', { ...validPayload['map-access'], ver: '4' }],
    ['2fa-pending', { ...validPayload['2fa-pending'], typ: 'crm' }],
    ['2fa-pending', { ...validPayload['2fa-pending'], jti: '' }],
  ] as const)('rejects a correctly keyed %s token with wrong claims %j', (purpose, payload) => {
    const token = signWithPurposeKey(purpose, payload)
    expect(() => verifiers[purpose](token)).toThrow(/invalid token claims/)
  })
})
