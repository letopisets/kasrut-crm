import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { MapJWTPayload } from '../models/types'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'

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
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as MapJWTPayload
    if (
      payload.typ !== 'map_user' ||
      typeof payload.ver !== 'number' ||
      typeof payload.jti !== 'string' ||
      !payload.jti
    ) {
      res.status(401).json({ error: 'Invalid token type' })
      return
    }

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
