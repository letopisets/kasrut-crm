import type { Request, Response, NextFunction } from 'express'
import type { MapJWTPayload } from '../models/types'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'
import { verifyMapAccessToken } from '../lib/jwt'

declare global {
  namespace Express {
    interface Request {
      mapUser?: MapJWTPayload
    }
  }
}

export async function authenticateMapJWT(req: Request, res: Response, next: NextFunction): Promise<void> {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    // Requires the map-access key/audience plus typ='map_user', a jti and a
    // session version; CRM and pre-2FA tokens never verify here.
    const payload = verifyMapAccessToken(header.slice(7))

    if (await isTokenBlacklisted(payload.jti)) {
      res.status(401).json({ error: 'Token has been revoked' })
      return
    }

    const current = await mapCommunityRepo.findUserById(payload.sub)
    if (!current || current.sessionVersion !== payload.ver) {
      res.status(401).json({ error: 'Session has been revoked' })
      return
    }

    req.mapUser = {
      ...payload,
      name: current.name,
      email: current.email,
      ver: current.sessionVersion,
    }
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
