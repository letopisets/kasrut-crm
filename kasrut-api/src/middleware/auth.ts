import type { Request, Response, NextFunction } from 'express'
import type { JWTPayload } from '../models/types'
import { verifyCrmAccessToken } from '../lib/jwt'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { usersRepo } from '../db/users.repo'
import { isTwoFactorSetupRequired } from '../lib/twoFactorPolicy'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
      tokenRaw?: string
    }
  }
}

// The only CRM calls an owner who still has to enrol in 2FA (REQUIRE_OWNER_2FA)
// may make: read the session, sign out, and complete setup. Keys are
// "METHOD baseUrl+path" with no query string; anything else is refused.
export const TWO_FACTOR_SETUP_ALLOWLIST: ReadonlySet<string> = new Set([
  'GET /api/auth/me',
  'POST /api/auth/logout',
  'POST /api/auth/2fa/setup',
  'POST /api/auth/2fa/enable',
])

function isTwoFactorSetupRequest(req: Request): boolean {
  return TWO_FACTOR_SETUP_ALLOWLIST.has(`${req.method} ${req.baseUrl}${req.path}`)
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice(7)
  try {
    // Only CRM access tokens verify here: public map-user and pre-2FA tokens
    // are signed with different derived keys and audiences, and the verifier
    // still requires typ='crm', a role, a jti and a session version.
    const payload = verifyCrmAccessToken(token)

    // Reject revoked tokens (logout blacklist)
    if (await isTokenBlacklisted(payload.jti)) {
      res.status(401).json({ error: 'Token has been revoked' })
      return
    }

    // Authorization claims are only a snapshot. Resolve the current account
    // on every request so deletion, role changes, tenant moves and tenant
    // suspension take effect immediately rather than when a 7-day JWT expires.
    const currentUser = await usersRepo.findAuthById(payload.sub)
    if (!currentUser) {
      res.status(401).json({ error: 'Account is inactive or unavailable' })
      return
    }

    const tokenRabbanutId = payload.rabbanutId ?? null
    const currentRabbanutId = currentUser.rabbanutId ?? null
    const tokenMashgiachId = payload.mashgiachId ?? null
    const currentMashgiachId = currentUser.mashgiachId ?? null
    const currentVersion = currentUser.sessionVersion ?? 0
    if (
      payload.ver !== currentVersion ||
      payload.role !== currentUser.role ||
      tokenRabbanutId !== currentRabbanutId ||
      tokenMashgiachId !== currentMashgiachId
    ) {
      res.status(401).json({ error: 'Authorization has changed; sign in again' })
      return
    }

    if (isTwoFactorSetupRequired(currentUser) && !isTwoFactorSetupRequest(req)) {
      // req.user is not set on this path, so name the account for the audit
      // log: a refused call is exactly what the log should show.
      res.locals.serviceLogActor = {
        userId:    currentUser.id,
        userEmail: currentUser.email,
        userRole:  currentUser.role,
        actorType: 'crm_user',
      }
      res.locals.serviceLogMessage = 'Blocked: 2FA setup required'
      res.status(403).json({
        error: 'Two-factor authentication setup required',
        code:  'TWO_FACTOR_SETUP_REQUIRED',
      })
      return
    }

    const currentPayload: JWTPayload = {
      ...payload,
      sub: currentUser.id,
      role: currentUser.role,
      name: currentUser.name,
      email: currentUser.email,
    }
    if (currentUser.rabbanutId) currentPayload.rabbanutId = currentUser.rabbanutId
    else delete currentPayload.rabbanutId
    if (currentUser.mashgiachId) currentPayload.mashgiachId = currentUser.mashgiachId
    else delete currentPayload.mashgiachId

    req.user = currentPayload
    req.tokenRaw = token
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
