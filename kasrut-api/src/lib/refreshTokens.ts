import { createHash, randomBytes, randomUUID } from 'crypto'
import type { CookieOptions, NextFunction, Request, RequestHandler, Response } from 'express'
import { env } from '../config/env'
import { refreshTokensRepo, type RefreshTokenAudience, type RefreshTokenRow } from '../db/refreshTokens.repo'
import { logger } from './logger'

/**
 * Rotating refresh tokens for the CRM and the public map.
 *
 * A refresh token is 32 random bytes (base64url) in an httpOnly cookie; only
 * its SHA-256 is stored. Every successful refresh marks the presented token
 * used and issues its successor in the same family. A family ends
 * REFRESH_TOKEN_TTL_DAYS after the sign-in that started it, however often it
 * is renewed. Presenting a token that was already used or revoked means a
 * copy of it exists somewhere else: the whole family is revoked and the
 * account's sessionVersion is bumped, which also kills every access token
 * issued from it (within REUSE_GRACE_MS only the family is revoked).
 *
 * Each token records the account's sessionVersion when it was issued and is
 * refused once that changes (logout, password reset, 2FA change, role or
 * tenant change), so every sign-out path that bumps the version also ends
 * refresh sessions without touching this table.
 */

export type RefreshAudience = RefreshTokenAudience

interface RefreshCookie { name: string; path: string }

// Host-only cookies scoped to their API's auth routes: the browser sends the
// CRM one only to /api/auth/* on the CRM host and the map one only to
// /api/map-auth/* on the map host.
export const REFRESH_COOKIES: Readonly<Record<RefreshAudience, RefreshCookie>> = {
  crm: { name: 'kashrut_crm_rt', path: '/api/auth' },
  map: { name: 'kashrut_map_rt', path: '/api/map-auth' },
}

// Required on the refresh endpoints: an HTML form or image cannot send a
// custom header. It is not enough on its own, because CORS lets the API's
// other origins send it too (see isSameOriginRequest).
export const REFRESH_REQUEST_HEADER = 'X-Requested-With'
const REFRESH_REQUEST_HEADER_VALUE = 'kashrut'

const TOKEN_BYTES = 32
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/   // 32 bytes as unpadded base64url
const USER_AGENT_MAX = 200
const MS_PER_DAY = 86_400_000

// A token presented again this soon after it was used is most likely a
// response that never reached the browser (a reload or a dropped connection
// mid-refresh), and one presented this soon after it was revoked unused, a
// refresh that was under way when a new sign-in replaced the cookie; neither
// is a stolen copy. The family is still revoked, but the account's other
// sessions are left alone.
export const REUSE_GRACE_MS = 60_000

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function refreshTtlMs(): number {
  return env.REFRESH_TOKEN_TTL_DAYS * MS_PER_DAY
}

function userAgentOf(req: Request): string | null {
  const agent = req.get('user-agent')?.trim()
  return agent ? agent.slice(0, USER_AGENT_MAX) : null
}

function ownerIdOf(token: RefreshTokenRow): string | null {
  return token.audience === 'crm' ? token.userId : token.mapUserId
}

// ── Cookies ───────────────────────────────────────────────────────────────────

/** The value of cookie `name` in a Cookie request header, or null. */
export function readCookie(header: string | undefined, name: string): string | null {
  if (!header) return null
  for (const pair of header.split(';')) {
    const eq = pair.indexOf('=')
    if (eq === -1 || pair.slice(0, eq).trim() !== name) continue
    let value = pair.slice(eq + 1).trim()
    if (value.length >= 2 && value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1)
    try {
      return decodeURIComponent(value)
    } catch {
      return null
    }
  }
  return null
}

function cookieOptions(audience: RefreshAudience): CookieOptions {
  return {
    httpOnly: true,
    secure:   env.COOKIE_SECURE,
    sameSite: 'strict',
    path:     REFRESH_COOKIES[audience].path,
  }
}

function readRefreshCookie(req: Request, audience: RefreshAudience): string | null {
  return readCookie(req.headers.cookie, REFRESH_COOKIES[audience].name)
}

/** Sets the cookie to live as long as the token it carries (`maxAgeMs`). */
export function setRefreshCookie(res: Response, audience: RefreshAudience, token: string, maxAgeMs: number): void {
  res.cookie(REFRESH_COOKIES[audience].name, token, { ...cookieOptions(audience), maxAge: Math.max(0, maxAgeMs) })
}

/** Expires the cookie; the Path must match the one it was set with. */
export function clearRefreshCookie(res: Response, audience: RefreshAudience): void {
  res.clearCookie(REFRESH_COOKIES[audience].name, cookieOptions(audience))
}

// ── Request checks (CSRF) ─────────────────────────────────────────────────────

function hostnameOf(url: string): string | null {
  try {
    return new URL(url).hostname || null
  } catch {
    return null
  }
}

/**
 * False when the browser reports that the request comes from a page on
 * another origin. Sec-Fetch-Site and Origin are set by the browser and cannot
 * be changed by page script, unlike X-Requested-With, which the credentialed
 * CORS policy lets every origin in CORS_ORIGINS send. In production the map
 * (mykoshermap.com) and the CRM (crm.mykoshermap.com) are same-site to each
 * other, so SameSite=Strict alone would let a script on one reach the other's
 * cookie. 'same-site' is accepted only between equal host names: a local dev
 * SPA calling the API on another port of the same host. The host name is
 * taken from the Host header (nginx passes it on), never X-Forwarded-Host,
 * which a CORS request could set. A request with neither header did not come
 * from a browser page.
 */
function isSameOriginRequest(req: Request): boolean {
  const site = req.get('sec-fetch-site')
  if (site === 'same-origin') return true
  if (site !== undefined && site !== 'same-site') return false

  const origin = req.get('origin')
  if (origin === undefined) return site === undefined
  const originHost = hostnameOf(origin)
  return originHost !== null && originHost === hostnameOf(`http://${req.get('host') ?? ''}`)
}

function hasRefreshRequestHeader(req: Request): boolean {
  return req.get(REFRESH_REQUEST_HEADER) === REFRESH_REQUEST_HEADER_VALUE
}

/**
 * Guards the calls that start a session without an access token (login, 2FA
 * login steps, registration, OAuth, password-reset confirm). Each sets the
 * refresh cookie, so a cross-site form posting someone else's credentials
 * would sign the victim's browser into the attacker's account. A form cannot
 * send a JSON body, and a cross-origin page is turned away by Origin.
 */
export function requireSessionStartRequest(req: Request, res: Response, next: NextFunction): void {
  if (!req.is('application/json')) {
    res.status(415).json({ error: 'Content-Type must be application/json' }); return
  }
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: 'Cross-origin request refused' }); return
  }
  next()
}

/** Guards the refresh calls: the custom header, and the request's own origin only. */
export function requireRefreshRequest(req: Request, res: Response, next: NextFunction): void {
  if (!hasRefreshRequestHeader(req)) {
    res.status(403).json({ error: 'Missing X-Requested-With header' }); return
  }
  if (!isSameOriginRequest(req)) {
    res.status(403).json({ error: 'Cross-origin request refused' }); return
  }
  next()
}

/**
 * Guards sign-out: a request with an access token is authenticated by it as
 * usual; one without (a client that lost its token, or could not renew it)
 * is let through on the refresh-call guards, to end the session its refresh
 * cookie carries. The cookie is httpOnly, so only the API can revoke it.
 */
export function bearerOrRefreshRequest(authenticate: RequestHandler): RequestHandler {
  return (req, res, next) => {
    if (req.headers.authorization !== undefined) return authenticate(req, res, next)
    requireRefreshRequest(req, res, next)
  }
}

// ── Tokens ────────────────────────────────────────────────────────────────────

interface IssueInput {
  audience:       RefreshAudience
  ownerId:        string
  sessionVersion: number
  userAgent:      string | null
  familyId?:      string   // a new family when omitted
  expiresAt?:     Date     // REFRESH_TOKEN_TTL_DAYS from now when omitted
}

function newToken(input: IssueInput, now: Date) {
  const token = randomBytes(TOKEN_BYTES).toString('base64url')
  return {
    token,
    row: {
      tokenHash:      hashRefreshToken(token),
      familyId:       input.familyId ?? randomUUID(),
      audience:       input.audience,
      ownerId:        input.ownerId,
      sessionVersion: input.sessionVersion,
      expiresAt:      input.expiresAt ?? new Date(now.getTime() + refreshTtlMs()),
      userAgent:      input.userAgent,
    },
  }
}

/** Stores a new refresh token (a new family unless one is given) and returns its raw value. */
export async function issueRefreshToken(input: IssueInput): Promise<string> {
  const { token, row } = newToken(input, new Date())
  await refreshTokensRepo.create(row)
  return token
}

async function findPresented(req: Request, audience: RefreshAudience): Promise<RefreshTokenRow | null> {
  const presented = readRefreshCookie(req, audience)
  if (!presented || !TOKEN_PATTERN.test(presented)) return null
  const token = await refreshTokensRepo.findByHash(hashRefreshToken(presented))
  return token && token.audience === audience ? token : null
}

/**
 * Starts a refresh session for an account that has just fully signed in:
 * a new family bound to its current sessionVersion, set as the cookie. The
 * cookie it replaces is revoked first, whoever it belonged to, so a session
 * the browser can no longer present does not stay usable elsewhere.
 */
export async function startRefreshSession(
  req: Request,
  res: Response,
  audience: RefreshAudience,
  account: { id: string; sessionVersion?: number },
): Promise<void> {
  const replaced = await findPresented(req, audience)
  if (replaced) await revokeRefreshFamily(replaced.familyId)

  const token = await issueRefreshToken({
    audience,
    ownerId:        account.id,
    sessionVersion: account.sessionVersion ?? 0,
    userAgent:      userAgentOf(req),
  })
  setRefreshCookie(res, audience, token, refreshTtlMs())
}

export type RefreshFailure =
  | 'missing'    // no (well-formed) token presented
  | 'unknown'    // no such token
  | 'audience'   // a token of the other client
  | 'expired'
  | 'replayed'   // presented again within REUSE_GRACE_MS: family revoked, other sessions kept
  | 'reused'     // used or revoked longer ago: family revoked, sessions bumped
  | 'inactive'   // account gone or unavailable, or its sessionVersion moved on

export type RefreshOutcome<A> =
  | { ok: true; account: A; token: string; expiresAt: Date }
  | { ok: false; reason: RefreshFailure; ownerId?: string }

/** Revokes the family of a token presented again; true when it was a real reuse. */
async function handleReuse(token: RefreshTokenRow, now: Date): Promise<boolean> {
  const context = { audience: token.audience, familyId: token.familyId, ownerId: ownerIdOf(token) }
  const retiredAt = token.usedAt ?? token.revokedAt
  if (retiredAt && now.getTime() - retiredAt.getTime() < REUSE_GRACE_MS) {
    await refreshTokensRepo.revokeFamily(token.familyId, now)
    logger.info(context, 'Refresh token presented again within the grace window; family revoked')
    return false
  }
  await refreshTokensRepo.revokeFamilyAndSessions(token, now)
  logger.warn(context, 'Refresh token reuse detected; family revoked and sessions ended')
  return true
}

/**
 * Validates the presented refresh token and rotates it. `loadAccount`
 * resolves the owner as authentication would (null when it must not sign in);
 * the account's sessionVersion must still equal the token's. The successor
 * keeps the family's expiry.
 */
export async function rotateRefreshToken<A extends { id: string; sessionVersion?: number }>(
  req: Request,
  audience: RefreshAudience,
  loadAccount: (ownerId: string) => Promise<A | null>,
): Promise<RefreshOutcome<A>> {
  const presented = readRefreshCookie(req, audience)
  if (!presented || !TOKEN_PATTERN.test(presented)) return { ok: false, reason: 'missing' }

  const now = new Date()
  const tokenHash = hashRefreshToken(presented)
  const token = await refreshTokensRepo.findByHash(tokenHash)
  if (!token) return { ok: false, reason: 'unknown' }
  if (token.audience !== audience) return { ok: false, reason: 'audience' }

  const ownerId = ownerIdOf(token)
  if (!ownerId) return { ok: false, reason: 'unknown' }

  if (token.usedAt || token.revokedAt) {
    return { ok: false, reason: await handleReuse(token, now) ? 'reused' : 'replayed', ownerId }
  }
  if (token.expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'expired', ownerId }

  const account = await loadAccount(ownerId)
  if (!account || (account.sessionVersion ?? 0) !== token.sessionVersion) {
    return { ok: false, reason: 'inactive', ownerId }
  }

  const successor = newToken({
    audience,
    ownerId,
    sessionVersion: token.sessionVersion,
    userAgent:      userAgentOf(req),
    familyId:       token.familyId,
    expiresAt:      token.expiresAt,
  }, now)
  if (!await refreshTokensRepo.rotate(token.id, successor.row, now)) {
    // Another request claimed or revoked this token between the read and the
    // claim (the same token was presented twice), or it just expired.
    const current = await refreshTokensRepo.findByHash(tokenHash) ?? token
    if (!current.usedAt && !current.revokedAt) return { ok: false, reason: 'expired', ownerId }
    return { ok: false, reason: await handleReuse(current, now) ? 'reused' : 'replayed', ownerId }
  }
  return { ok: true, account, token: successor.token, expiresAt: token.expiresAt }
}

/** Revokes every token of a family; presenting one of them later counts as reuse. */
export async function revokeRefreshFamily(familyId: string): Promise<void> {
  await refreshTokensRepo.revokeFamily(familyId, new Date())
}

/**
 * Sign-out by the refresh cookie alone (see bearerOrRefreshRequest): revokes
 * the presented cookie's family. When that cookie was still a live session
 * (unused, unrevoked, unexpired) the account's sessionVersion is bumped too,
 * but only while it still equals the cookie's, which is what a sign-out with
 * an access token does; a stale cookie cannot end anyone's other sessions.
 * Returns the owner's id, or null when no known cookie was presented.
 */
export async function endPresentedRefreshSession(req: Request, audience: RefreshAudience): Promise<string | null> {
  const token = await findPresented(req, audience)
  if (!token) return null
  const now = new Date()
  const live = !token.usedAt && !token.revokedAt && token.expiresAt.getTime() > now.getTime()
  if (live) await refreshTokensRepo.revokeFamilyAndSessions(token, now)
  else await refreshTokensRepo.revokeFamily(token.familyId, now)
  return ownerIdOf(token)
}

/**
 * Logout: revokes the family of the presented cookie, if it belongs to the
 * account signing out. Another account's cookie in the same browser is left
 * alone (the logout response still clears it).
 */
export async function revokePresentedRefreshFamily(
  req: Request,
  audience: RefreshAudience,
  ownerId: string,
): Promise<void> {
  const token = await findPresented(req, audience)
  if (token && ownerIdOf(token) === ownerId) await revokeRefreshFamily(token.familyId)
}
