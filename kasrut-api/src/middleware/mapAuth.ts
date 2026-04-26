import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { MapJWTPayload } from '../models/types'

declare global {
  namespace Express {
    interface Request {
      mapUser?: MapJWTPayload
    }
  }
}

export function authenticateMapJWT(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  try {
    const payload = jwt.verify(header.slice(7), env.JWT_SECRET) as MapJWTPayload
    if (payload.typ !== 'map_user') {
      res.status(401).json({ error: 'Invalid token type' })
      return
    }
    req.mapUser = payload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
