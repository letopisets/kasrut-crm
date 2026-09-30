import path from 'path'
import type { Request, Response, NextFunction } from 'express'
import { errorHandler, postgresError, postgresSqlState } from '../middleware/errorHandler'
import { Prisma } from '../generated/prisma/client'
import { logger } from '../lib/logger'

// ── Real Prisma 7 + @prisma/adapter-pg error shapes ────────────────────────
// Mirrors `class DriverAdapterError` in
//   node_modules/@prisma/driver-adapter-utils/dist/index.js
// (name 'DriverAdapterError', message = payload.message ?? payload.kind,
// `cause` = the payload). The class is not re-exported by @prisma/client and
// @prisma/driver-adapter-utils is only a transitive dependency, so it is
// reproduced here; the parity test below compares it with the real class.
class DriverAdapterError extends Error {
  name = 'DriverAdapterError'
  cause: Record<string, unknown>
  constructor(payload: Record<string, unknown>) {
    super(typeof payload.message === 'string' ? payload.message : String(payload.kind))
    this.cause = payload
  }
}

// Payload built by convertDriverError()/mapDriverError() in
//   node_modules/@prisma/adapter-pg/dist/index.js
// for a pg error with an unmapped SQLSTATE (default branch -> kind 'postgres').
// That is what `RAISE EXCEPTION ... USING ERRCODE = '23514'` in the tenant
// triggers produces. The client runtime (rethrowAsUserFacing, `ze()` in
// node_modules/@prisma/client/runtime/client.js) has no P-code for kind
// 'postgres', so RequestHandler.handleRequestError rethrows the bare
// DriverAdapterError with only `clientVersion` added. Captured the same way
// from a live `prisma.restaurant.update()` against the migrated schema.
function triggerViolation(message = 'Restaurant and mashgiach must belong to the same rabbanut') {
  const err = new DriverAdapterError({
    originalCode:    '23514',
    originalMessage: message,
    kind:            'postgres',
    code:            '23514',
    severity:        'ERROR',
    message,
    detail:          undefined,
    column:          undefined,
    hint:            undefined,
  })
  return Object.assign(err, { clientVersion: '7.7.0' })
}

// 23503 is mapped by mapDriverError() to kind 'ForeignKeyConstraintViolation',
// which the runtime turns into P2003 with the adapter error in
// meta.driverAdapterError (RequestHandler adds meta.modelName).
function foreignKeyViolation() {
  const adapterError = new DriverAdapterError({
    originalCode:    '23503',
    originalMessage: 'insert or update on table "inspections" violates foreign key constraint "inspections_restaurantId_fkey"',
    kind:            'ForeignKeyConstraintViolation',
    constraint:      { index: 'inspections_restaurantId_fkey' },
  })
  return new Prisma.PrismaClientKnownRequestError(
    'Foreign key constraint violated on the constraint: `inspections_restaurantId_fkey`',
    { code: 'P2003', clientVersion: '7.7.0', meta: { modelName: 'Inspection', driverAdapterError: adapterError } },
  )
}

// Raw queries ($queryRaw / $executeRaw) go through `Sn()` in the same runtime
// file: every adapter error becomes P2010 "Raw query failed. Code: `…`".
function rawQueryFailure(code: string, kind = 'postgres', message = 'db says no') {
  const adapterError = new DriverAdapterError({ originalCode: code, originalMessage: message, kind, code, severity: 'ERROR', message })
  return new Prisma.PrismaClientKnownRequestError(
    `Raw query failed. Code: \`${code}\`. Message: \`${message}\``,
    { code: 'P2010', clientVersion: '7.7.0', meta: { driverAdapterError: adapterError } },
  )
}

// A genuine CHECK constraint, e.g. map_restaurant_reviews_rating_check: same
// SQLSTATE 23514 as the triggers, but pg's own "violates check constraint" text.
const CHECK_MESSAGE = 'new row for relation "map_restaurant_reviews" violates check constraint "map_restaurant_reviews_rating_check"'

// ── Harness ────────────────────────────────────────────────────────────────
function run(err: unknown) {
  const req = { method: 'PATCH', path: '/api/restaurants/r1' } as Request
  const res = {
    locals: {} as Record<string, unknown>,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) { this.statusCode = code; return this },
    json(payload: unknown) { this.body = payload; return this },
  }
  errorHandler(err, req, res as unknown as Response, jest.fn() as NextFunction)
  return res
}

const TENANT_CONFLICT = { error: 'Conflict: records must belong to the same rabbanut' }

describe('postgresSqlState', () => {
  it('reads the SQLSTATE of a bare DriverAdapterError (trigger 23514)', () => {
    expect(postgresSqlState(triggerViolation())).toBe('23514')
  })

  it('falls back to cause.code for kind "postgres" without originalCode', () => {
    const err = new DriverAdapterError({ kind: 'postgres', code: '23514', severity: 'ERROR', message: 'x' })
    expect(postgresSqlState(err)).toBe('23514')
  })

  it('reads meta.driverAdapterError of a PrismaClientKnownRequestError', () => {
    expect(postgresSqlState(foreignKeyViolation())).toBe('23503')
    expect(postgresSqlState(rawQueryFailure('23514'))).toBe('23514')
  })

  it('also returns the server message (originalMessage) for logging', () => {
    expect(postgresError(triggerViolation('Mashgiach and hechsher must belong to the same rabbanut'))).toEqual({
      sqlState: '23514', message: 'Mashgiach and hechsher must belong to the same rabbanut',
    })
    expect(postgresError(rawQueryFailure('23514', 'postgres', CHECK_MESSAGE))).toEqual({
      sqlState: '23514', message: CHECK_MESSAGE,
    })
  })

  it('follows a wrapped cause chain', () => {
    const wrapped = Object.assign(new Error('wrapped'), { cause: triggerViolation() })
    expect(postgresSqlState(wrapped)).toBe('23514')
  })

  it('accepts a plain node-postgres DatabaseError', () => {
    const pgError = Object.assign(new Error('violates check constraint'), { code: '23514', severity: 'ERROR' })
    expect(postgresSqlState(pgError)).toBe('23514')
    expect(postgresError(pgError)?.message).toBe('violates check constraint')
  })

  it('does not mistake Prisma P-codes or random objects for SQLSTATEs', () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('Unique', { code: 'P2002', clientVersion: '7.7.0' })
    expect(postgresSqlState(p2002)).toBeUndefined()
    expect(postgresSqlState(new Error('boom'))).toBeUndefined()
    expect(postgresSqlState({ code: '23514' })).toBeUndefined()
    expect(postgresSqlState(null)).toBeUndefined()
    expect(postgresSqlState('23514')).toBeUndefined()
  })

  it('stops on cyclic cause chains', () => {
    const a: Error & { cause?: unknown } = new Error('a')
    a.cause = Object.assign(new Error('b'), { cause: a })
    expect(postgresSqlState(a)).toBeUndefined()
  })
})

describe('errorHandler: tenant trigger violations', () => {
  afterEach(() => jest.restoreAllMocks())

  // Every RAISE text in migration 20260714100000_enforce_tenant_invariants.
  it.each([
    'Restaurant and mashgiach must belong to the same rabbanut',
    'Restaurant and hechsher must belong to the same rabbanut',
    'Mashgiach and hechsher must belong to the same rabbanut',
    'Inspection restaurant and mashgiach must belong to the same rabbanut',
    'User and mashgiach must belong to the same rabbanut',
    'Mashgiach users require rabbanutId and mashgiachId',
    'Only mashgiach users may reference a mashgiach profile',
    'Cannot move a mashgiach while cross-tenant dependants remain',
    'Cannot move a hechsher while cross-tenant dependants remain',
  ])('maps "%s" (23514) to 409 without echoing the DB message', message => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const res = run(triggerViolation(message))

    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual(TENANT_CONFLICT)
    expect(JSON.stringify(res.body)).not.toContain(message)
    expect(res.locals.serviceErrorMessage).toBe(
      'Cross-rabbanut link rejected by the database on PATCH /api/restaurants/r1',
    )
    // Server-side log keeps which invariant fired.
    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ sqlState: '23514', dbMessage: message }),
      'Tenant invariant violation',
    )
  })

  it('maps a raw-query 23514 (P2010) from a trigger to the same 409', () => {
    const res = run(rawQueryFailure('23514', 'postgres', 'Restaurant and hechsher must belong to the same rabbanut'))
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual(TENANT_CONFLICT)
  })
})

describe('errorHandler: other check constraint violations', () => {
  afterEach(() => jest.restoreAllMocks())

  it.each([
    ['bare DriverAdapterError', () => triggerViolation(CHECK_MESSAGE)],
    ['raw query (P2010)',      () => rawQueryFailure('23514', 'postgres', CHECK_MESSAGE)],
    ['23514 without a message', () => new DriverAdapterError({ kind: 'postgres', code: '23514', severity: 'ERROR' })],
  ])('does not report a CHECK violation (%s) as a cross-rabbanut conflict', (_label, make) => {
    const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined)
    const res = run(make())

    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Request violates a data constraint' })
    expect(JSON.stringify(res.body)).not.toContain('map_restaurant_reviews')
    expect(res.locals.serviceErrorMessage).toBe('Check constraint violated on PATCH /api/restaurants/r1')
    expect(warn).toHaveBeenCalledWith(expect.objectContaining({ sqlState: '23514' }), 'Check constraint violation')
  })
})

describe('errorHandler: foreign key violations', () => {
  it('keeps mapping P2003 (23503) to 409 related-record conflict', () => {
    const res = run(foreignKeyViolation())
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'Conflict: related record not found' })
  })

  it('maps a raw-query 23503 (P2010) to 409 related-record conflict', () => {
    const res = run(rawQueryFailure('23503', 'ForeignKeyConstraintViolation'))
    expect(res.statusCode).toBe(409)
    expect(res.body).toEqual({ error: 'Conflict: related record not found' })
    expect(res.locals.serviceErrorMessage).toBe('Foreign key violation on PATCH /api/restaurants/r1')
  })
})

// Shape of the http-errors that body-parser passes to next(): see
// createError(...) in node_modules/body-parser/lib/read.js.
function bodyParserError(status: number, type: string) {
  return Object.assign(new Error('Unexpected token } in JSON at position 9'), {
    status, statusCode: status, expose: status < 500, type, body: '{"a": 1,}',
  })
}

describe('errorHandler: body-parser rejections', () => {
  it('maps a malformed body to 400 without echoing the parser message', () => {
    const res = run(bodyParserError(400, 'entity.parse.failed'))
    expect(res.statusCode).toBe(400)
    expect(res.body).toEqual({ error: 'Invalid request body' })
    expect(res.locals.serviceErrorMessage).toBe('Request body rejected (entity.parse.failed) on PATCH /api/restaurants/r1')
  })

  it('maps an oversized body to 413 and an unsupported charset to 415', () => {
    const tooLarge = run(bodyParserError(413, 'entity.too.large'))
    expect(tooLarge.statusCode).toBe(413)
    expect(tooLarge.body).toEqual({ error: 'Request body too large' })
    expect(run(bodyParserError(415, 'charset.unsupported')).statusCode).toBe(415)
  })

  it('does not log them at error level', () => {
    const errorSpy = jest.spyOn(logger, 'error').mockImplementation(() => undefined)
    try {
      run(bodyParserError(400, 'entity.parse.failed'))
      expect(errorSpy).not.toHaveBeenCalled()
    } finally {
      errorSpy.mockRestore()
    }
  })

  it('keeps 500 for server-side parser faults (expose: false)', () => {
    const res = run(bodyParserError(500, 'stream.not.readable'))
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('ignores status-carrying errors without a body-parser type', () => {
    const res = run(Object.assign(new Error('nope'), { status: 400, expose: true }))
    expect(res.statusCode).toBe(500)
  })
})

describe('errorHandler: everything else', () => {
  it('still returns 500 for other driver adapter errors', () => {
    const deadlock = new DriverAdapterError({ originalCode: '40P01', kind: 'postgres', code: '40P01', severity: 'ERROR', message: 'deadlock detected' })
    const res = run(deadlock)
    expect(res.statusCode).toBe(500)
    expect(res.body).toEqual({ error: 'Internal server error' })
  })

  it('still maps P2025 to 404 and P2002 to 409', () => {
    const notFound = new Prisma.PrismaClientKnownRequestError('nf', { code: 'P2025', clientVersion: '7.7.0' })
    const dup = new Prisma.PrismaClientKnownRequestError('dup', { code: 'P2002', clientVersion: '7.7.0' })
    expect(run(notFound).statusCode).toBe(404)
    expect(run(dup).statusCode).toBe(409)
  })
})

// Guards the hand-written DriverAdapterError above against drift. The class
// lives in @prisma/driver-adapter-utils, a direct dependency of
// @prisma/adapter-pg (not of this package), so it is resolved from there: that
// works under hoisting and strict (pnpm-style) installs alike, and a failure to
// load it fails the test instead of silently skipping it.
it('matches the real @prisma/driver-adapter-utils DriverAdapterError', () => {
  const adapterUtilsPath = require.resolve('@prisma/driver-adapter-utils', {
    paths: [path.dirname(require.resolve('@prisma/adapter-pg'))],
  })
  const realAdapterUtils = jest.requireActual<{
    DriverAdapterError: new (payload: Record<string, unknown>) => Error
  }>(adapterUtilsPath)
  const payload = triggerViolation().cause
  const real = new realAdapterUtils.DriverAdapterError(payload) as Error & { cause: unknown }
  const mirror = new DriverAdapterError(payload)

  expect(real.name).toBe(mirror.name)
  expect(real.message).toBe(mirror.message)
  expect(real.cause).toBe(payload)
  expect(postgresSqlState(real)).toBe('23514')
  expect(run(real).statusCode).toBe(409)
})
