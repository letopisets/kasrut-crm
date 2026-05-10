import type { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/validate'
import { ForbiddenScopeError } from '../lib/rabbanutScope'
import { Prisma } from '../generated/prisma/client'
import { logger } from '../lib/logger'
import { isProd } from '../lib/runtime'

export function errorHandler(
  err: unknown,
  req: Request,
  res: Response,
  _next: NextFunction,
): void {
  if (err instanceof ValidationError) {
    res.locals.serviceErrorMessage = `Validation failed for ${req.method} ${req.path}`
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

  // Translate known Prisma errors to appropriate HTTP status codes instead of
  // letting them fall through to the generic 500 handler.
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    switch (err.code) {
      case 'P2025':
        res.status(404).json({ error: 'Not found' })
        return
      case 'P2002':
        res.status(409).json({ error: 'Conflict: record already exists' })
        return
      case 'P2003':
        res.status(409).json({ error: 'Conflict: related record not found' })
        return
    }
  }

  const message = err instanceof Error ? err.message : String(err)
  res.locals.serviceErrorMessage = message
  logger.error({ err, method: req.method, path: req.path }, message)

  res.status(500).json({ error: 'Internal server error' })
}
