import type { Request, Response, NextFunction } from 'express'
import { ValidationError } from '../lib/validate'
import { ForbiddenScopeError } from '../lib/rabbanutScope'
import { Prisma } from '../generated/prisma/client'
import { logger } from '../lib/logger'
import { isProd } from '../lib/runtime'

const PG_CHECK_VIOLATION       = '23514'
const PG_FOREIGN_KEY_VIOLATION = '23503'

type AdapterErrorPayload = Record<string, unknown>

interface DriverAdapterErrorLike {
  name: 'DriverAdapterError'
  cause: AdapterErrorPayload
}

// Duck-typed like isDriverAdapterError() in @prisma/driver-adapter-utils:
// @prisma/client does not re-export the class, so instanceof is not an option.
function isDriverAdapterError(value: unknown): value is DriverAdapterErrorLike {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as { name?: unknown; cause?: unknown }
  return candidate.name === 'DriverAdapterError'
    && typeof candidate.cause === 'object'
    && candidate.cause !== null
}

// node-postgres DatabaseError, in case a pg error ever reaches us unwrapped.
function isPgDatabaseError(value: unknown): value is Error & { code: string } {
  if (!(value instanceof Error)) return false
  const candidate = value as { code?: unknown; severity?: unknown }
  return typeof candidate.code === 'string'
    && /^[0-9A-Z]{5}$/.test(candidate.code)
    && typeof candidate.severity === 'string'
}

export interface PostgresErrorInfo {
  sqlState: string
  /** Raw server message. Server-side logs only: never send it to a client. */
  message?: string
}

function fromAdapterPayload(payload: AdapterErrorPayload): PostgresErrorInfo | undefined {
  const sqlState = typeof payload.originalCode === 'string'
    ? payload.originalCode
    : payload.kind === 'postgres' && typeof payload.code === 'string' ? payload.code : undefined
  if (!sqlState) return undefined
  const message = typeof payload.originalMessage === 'string'
    ? payload.originalMessage
    : typeof payload.message === 'string' ? payload.message : undefined
  return { sqlState, message }
}

/**
 * Postgres SQLSTATE (and server message) behind an error thrown by
 * Prisma 7 + @prisma/adapter-pg.
 *
 * adapter-pg wraps every pg error in a DriverAdapterError whose `cause` is
 * `{ originalCode, originalMessage, kind, ... }` (convertDriverError()). The
 * client runtime then only converts kinds it has a P-code for:
 *  - 23503 / 23505 / ... -> PrismaClientKnownRequestError (P2003 / P2002 / ...)
 *    with the adapter error in `meta.driverAdapterError`;
 *  - raw queries -> PrismaClientKnownRequestError P2010, same `meta`;
 *  - everything else, notably 23514 check_violation raised by our tenant
 *    triggers (`kind: 'postgres'`), is rethrown as the bare DriverAdapterError.
 * The `cause` chain is followed a few levels for wrapped errors.
 */
export function postgresError(err: unknown, depth = 0): PostgresErrorInfo | undefined {
  if (typeof err !== 'object' || err === null || depth > 3) return undefined
  if (isDriverAdapterError(err)) return fromAdapterPayload(err.cause)

  const meta = (err as { meta?: unknown }).meta
  if (typeof meta === 'object' && meta !== null) {
    const fromMeta = postgresError((meta as { driverAdapterError?: unknown }).driverAdapterError, depth + 1)
    if (fromMeta) return fromMeta
  }

  if (isPgDatabaseError(err)) return { sqlState: err.code, message: err.message }
  return postgresError((err as { cause?: unknown }).cause, depth + 1)
}

export function postgresSqlState(err: unknown): string | undefined {
  return postgresError(err)?.sqlState
}

// RAISE EXCEPTION texts of the tenant-invariant triggers (migration
// 20260714100000_enforce_tenant_invariants). Every other 23514 is a genuine
// CHECK constraint (e.g. map_restaurant_reviews_rating_check) and must not be
// reported as a cross-rabbanut conflict.
const TENANT_TRIGGER_MESSAGE = new RegExp([
  'must belong to the same rabbanut$',
  '^Cannot move a (?:mashgiach|hechsher) while cross-tenant dependants remain$',
  '^Mashgiach users require rabbanutId and mashgiachId$',
  '^Only mashgiach users may reference a mashgiach profile$',
].join('|'))

export function isTenantInvariantViolation(info: PostgresErrorInfo | undefined): boolean {
  return info?.sqlState === PG_CHECK_VIOLATION
    && typeof info.message === 'string'
    && TENANT_TRIGGER_MESSAGE.test(info.message)
}

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

  // The tenant-invariant triggers (migration 20260714100000) reject writes that
  // link rows of different rabbanuts with SQLSTATE 23514. That is a client
  // conflict, not a server fault. The DB message names the invariant, so it is
  // logged, but never echoed to the caller.
  const pgError = postgresError(err)
  const sqlState = pgError?.sqlState
  if (isTenantInvariantViolation(pgError)) {
    res.locals.serviceErrorMessage = `Cross-rabbanut link rejected by the database on ${req.method} ${req.path}`
    logger.warn({ method: req.method, path: req.path, sqlState, dbMessage: pgError?.message }, 'Tenant invariant violation')
    res.status(409).json({ error: 'Conflict: records must belong to the same rabbanut' })
    return
  }
  if (sqlState === PG_CHECK_VIOLATION) {
    res.locals.serviceErrorMessage = `Check constraint violated on ${req.method} ${req.path}`
    logger.warn({ method: req.method, path: req.path, sqlState, dbMessage: pgError?.message }, 'Check constraint violation')
    res.status(400).json({ error: 'Request violates a data constraint' })
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

  // FK violations that did not arrive as P2003 (e.g. raw queries -> P2010).
  if (sqlState === PG_FOREIGN_KEY_VIOLATION) {
    res.locals.serviceErrorMessage = `Foreign key violation on ${req.method} ${req.path}`
    res.status(409).json({ error: 'Conflict: related record not found' })
    return
  }

  const message = err instanceof Error ? err.message : String(err)
  res.locals.serviceErrorMessage = message
  logger.error({ err, method: req.method, path: req.path }, message)

  res.status(500).json({ error: 'Internal server error' })
}
