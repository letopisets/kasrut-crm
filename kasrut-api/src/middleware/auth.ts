import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { JWTPayload } from '../models/types'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { usersRepo } from '../db/users.repo'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
      tokenRaw?: string
    }
  }
}

export async function authenticateJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  const token = header.slice(7)
  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as JWTPayload

    // Reject tokens minted for a different audience. Public map-user tokens
    // (typ='map_user') and pre-2FA temp tokens (typ='2fa_pending', no role) are
    // signed with the same secret but must NEVER authenticate CRM endpoints.
    // A valid CRM token carries a role and — once re-issued after this change —
    // typ='crm'. Requiring a role also rejects legacy temp tokens that predate
    // the typ marker, since neither map nor 2FA-pending tokens ever carry one.
    const claims = payload as { typ?: string; role?: string }
    if ((claims.typ !== undefined && claims.typ !== 'crm') || !claims.role) {
      res.status(401).json({ error: 'Invalid token type' })
      return
    }

    // Reject revoked tokens (logout blacklist)
    if (payload.jti && await isTokenBlacklisted(payload.jti)) {
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
    const tokenVersion = payload.ver === undefined ? 0 : payload.ver
    const currentVersion = currentUser.sessionVersion ?? 0
    if (
      typeof tokenVersion !== 'number' ||
      !Number.isInteger(tokenVersion) ||
      tokenVersion < 0 ||
      tokenVersion !== currentVersion ||
      payload.role !== currentUser.role ||
      tokenRabbanutId !== currentRabbanutId ||
      tokenMashgiachId !== currentMashgiachId
    ) {
      res.status(401).json({ error: 'Authorization has changed; sign in again' })
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
