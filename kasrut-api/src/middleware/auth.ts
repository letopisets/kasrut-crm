import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { JWTPayload } from '../models/types'
import { isTokenBlacklisted } from '../lib/tokenBlacklist'

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

    // Reject revoked tokens (logout blacklist)
    if (payload.jti && await isTokenBlacklisted(payload.jti)) {
      res.status(401).json({ error: 'Token has been revoked' })
      return
    }

    req.user = payload
    req.tokenRaw = token
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
