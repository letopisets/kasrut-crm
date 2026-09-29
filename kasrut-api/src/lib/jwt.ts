import { createSecretKey, hkdfSync, randomUUID, type KeyObject } from 'crypto'
import jwt, { JsonWebTokenError, type JwtPayload, type SignOptions } from 'jsonwebtoken'
import { env } from '../config/env'
import type { JWTPayload, MapJWTPayload, Role } from '../models/types'

// Every token purpose is signed with its own HMAC key derived from JWT_SECRET,
// so a token minted for one purpose can never verify as another even if a claim
// check is missed somewhere. The typ/claim checks below stay as defence in depth.
// Changing the salt or an info string rotates the keys and invalidates every
// outstanding token of that purpose.
export type JwtPurpose = 'crm-access' | 'map-access' | '2fa-pending'

const JWT_ISSUER = 'kashrut-api'
const JWT_ALGORITHM = 'HS256'
const HKDF_SALT = 'kashrut-jwt-v1'
const TWO_FACTOR_PENDING_TTL = '5m'

function deriveKey(purpose: JwtPurpose): KeyObject {
  return createSecretKey(Buffer.from(hkdfSync('sha256', env.JWT_SECRET, HKDF_SALT, `kashrut:${purpose}`, 32)))
}

const KEYS: Record<JwtPurpose, KeyObject> = {
  'crm-access':  deriveKey('crm-access'),
  'map-access':  deriveKey('map-access'),
  '2fa-pending': deriveKey('2fa-pending'),
}

function sign(purpose: JwtPurpose, payload: object, expiresIn: SignOptions['expiresIn']): string {
  return jwt.sign(payload, KEYS[purpose], {
    algorithm: JWT_ALGORITHM,
    issuer:    JWT_ISSUER,
    audience:  purpose,
    expiresIn,
  })
}

function invalidToken(): JsonWebTokenError {
  return new JsonWebTokenError('invalid token claims')
}

// Throws a jsonwebtoken error (JsonWebTokenError / TokenExpiredError) on any
// failure; callers translate that into a 401.
function verify(purpose: JwtPurpose, token: string): JwtPayload & { exp: number; iat: number } {
  const payload = jwt.verify(token, KEYS[purpose], {
    algorithms: [JWT_ALGORITHM],
    issuer:     JWT_ISSUER,
    audience:   purpose,
  })
  if (typeof payload === 'string' || typeof payload.exp !== 'number' || typeof payload.iat !== 'number') {
    throw invalidToken()
  }
  return payload as JwtPayload & { exp: number; iat: number }
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isSessionVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

// ── CRM access tokens ─────────────────────────────────────────────────────────

export interface CrmAccessClaims {
  sub:          string
  role:         Role
  name:         string
  email:        string
  rabbanutId?:  string
  mashgiachId?: string
  ver:          number
  jti?:         string   // generated when omitted
}

export function signCrmAccessToken({ jti = randomUUID(), ...claims }: CrmAccessClaims): string {
  return sign('crm-access', { ...claims, typ: 'crm', jti }, env.JWT_EXPIRES_IN)
}

// Every verified CRM token carries a token id and a session version.
export type VerifiedCrmAccessToken = JWTPayload & { jti: string; ver: number }

export function verifyCrmAccessToken(token: string): VerifiedCrmAccessToken {
  const p = verify('crm-access', token)
  if (
    p.typ !== 'crm' ||
    !isNonEmptyString(p.sub) ||
    !isNonEmptyString(p.role) ||
    !isNonEmptyString(p.jti) ||
    !isSessionVersion(p.ver)
  ) throw invalidToken()

  const payload: VerifiedCrmAccessToken = {
    sub:   p.sub,
    role:  p.role as Role,
    name:  typeof p.name === 'string' ? p.name : '',
    email: typeof p.email === 'string' ? p.email : '',
    typ:   'crm',
    ver:   p.ver,
    jti:   p.jti,
    iat:   p.iat,
    exp:   p.exp,
  }
  if (isNonEmptyString(p.rabbanutId)) payload.rabbanutId = p.rabbanutId
  if (isNonEmptyString(p.mashgiachId)) payload.mashgiachId = p.mashgiachId
  return payload
}

// ── Public map access tokens ──────────────────────────────────────────────────

export interface MapAccessClaims {
  sub:   string
  name:  string
  email: string
  ver:   number
  jti?:  string   // generated when omitted
}

export function signMapAccessToken({ jti = randomUUID(), ...claims }: MapAccessClaims): string {
  return sign('map-access', { ...claims, typ: 'map_user', jti }, env.JWT_EXPIRES_IN)
}

export function verifyMapAccessToken(token: string): MapJWTPayload {
  const p = verify('map-access', token)
  if (
    p.typ !== 'map_user' ||
    !isNonEmptyString(p.sub) ||
    !isNonEmptyString(p.jti) ||
    !isSessionVersion(p.ver)
  ) throw invalidToken()

  return {
    sub:   p.sub,
    typ:   'map_user',
    name:  typeof p.name === 'string' ? p.name : '',
    email: typeof p.email === 'string' ? p.email : '',
    ver:   p.ver,
    jti:   p.jti,
    iat:   p.iat,
    exp:   p.exp,
  }
}

// ── CRM pre-2FA tokens (password verified, second factor pending) ─────────────

export interface TwoFactorPendingPayload {
  sub: string
  typ: '2fa_pending'
  jti: string
  exp: number
}

export function signTwoFactorPendingToken({ sub, jti = randomUUID() }: { sub: string; jti?: string }): string {
  return sign('2fa-pending', { sub, typ: '2fa_pending', jti }, TWO_FACTOR_PENDING_TTL)
}

export function verifyTwoFactorPendingToken(token: string): TwoFactorPendingPayload {
  const p = verify('2fa-pending', token)
  if (p.typ !== '2fa_pending' || !isNonEmptyString(p.sub) || !isNonEmptyString(p.jti)) {
    throw invalidToken()
  }
  return { sub: p.sub, typ: '2fa_pending', jti: p.jti, exp: p.exp }
}
