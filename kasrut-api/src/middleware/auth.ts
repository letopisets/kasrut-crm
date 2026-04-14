import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import { env } from '../config/env'
import type { JWTPayload } from '../models/types'

declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload
    }
  }
}

export function authenticateJWT(req: Request, res: Response, next: NextFunction): void {
  const header = req.headers.authorization
  if (!header?.startsWith('Bearer ')) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }
  try {
    req.user = jwt.verify(header.slice(7), env.JWT_SECRET) as JWTPayload
    next()
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' })
  }
}
