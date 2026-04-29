import type { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/validate'

const isProd = process.env.NODE_ENV === 'production'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    // In production expose only a generic message — Zod field details aid attackers in mapping the API
    if (isProd) {
      res.status(400).json({ error: 'Invalid request' })
    } else {
      res.status(400).json({ error: 'Validation failed', issues: err.issues })
    }
    return
  }

  const message = err instanceof Error ? err.message : String(err)
  if (isProd) console.error('[ERROR]', message)
  else        console.error('[ERROR]', err)

  res.status(500).json({ error: 'Internal server error' })
}
