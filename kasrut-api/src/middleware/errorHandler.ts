import type { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/validate'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.status(400).json({ error: 'Validation failed', issues: err.issues })
    return
  }

  const isProd  = process.env.NODE_ENV === 'production'
  const message = err instanceof Error ? err.message : String(err)
  if (isProd) console.error('[ERROR]', message)
  else        console.error('[ERROR]', err)

  res.status(500).json({ error: 'Internal server error' })
}
