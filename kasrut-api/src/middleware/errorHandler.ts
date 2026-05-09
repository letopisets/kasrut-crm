import type { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/validate'
import { ForbiddenScopeError } from '../lib/rabbanutScope'

const isProd = process.env.NODE_ENV === 'production'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.locals.serviceErrorMessage = `Validation failed for ${req.method} ${req.path}`
    // In production expose only a generic message — Zod field details aid attackers in mapping the API
    if (isProd) {
      res.status(400).json({ error: 'Invalid request' })
    } else {
      res.status(400).json({ error: 'Validation failed', issues: err.issues })
    }
    return
  }

  if (err instanceof ForbiddenScopeError) {
    res.locals.serviceErrorMessage = `Cross-rabbanut access denied on ${req.method} ${req.path}`
    res.status(403).json({ error: 'Forbidden' })
    return
  }

  const message = err instanceof Error ? err.message : String(err)
  res.locals.serviceErrorMessage = message
  if (isProd) console.error('[ERROR]', message)
  else        console.error('[ERROR]', err)

  res.status(500).json({ error: 'Internal server error' })
}
