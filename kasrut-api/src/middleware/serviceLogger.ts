import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { z } from 'zod'
import { serviceLogsRepo } from '../db/serviceLogs.repo'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ROUTE_ACTION_SEGMENTS = new Set(['assign', 'review', 'reviews', 'toggle'])
const SENSITIVE_METADATA_KEYS = new Set(['authorization', 'backupcode', 'code', 'idtoken', 'password', 'temptoken', 'token'])

// Client-controlled values are clipped before they are queued: a JSON body may
// be 2 MB, and one request must not be able to store a row that size.
const MAX_EMAIL_LENGTH = 254
const MAX_PATH_LENGTH = 512
const MAX_MESSAGE_LENGTH = 1000

function clip<T extends string | undefined>(value: T, max: number): T {
  return (value && value.length > max ? value.slice(0, max) : value) as T
}

const emailShape = z.string().max(MAX_EMAIL_LENGTH).email()

// userEmail is kept for 90 days and shown to every owner. On auth paths it
// comes from what a client typed, which is not always an address: a password
// in the email field, a phone number. Only a well-formed address is stored.
function storableEmail(value: string | undefined): string | undefined {
  return value !== undefined && emailShape.safeParse(value).success ? value : undefined
}

// Express matches routes case-insensitively and ignores a trailing slash, so
// '/API/Map/Reviews/x/' runs the same handler as '/api/map/reviews/x'. Every
// check below runs on this canonical form; otherwise changing the case would
// reach a handler yet skip its audit entry.
function routeKey(path: string): string {
  return path.toLowerCase().replace(/\/+$/, '') || '/'
}

interface ServiceLogActor {
  userId?: string
  userEmail?: string
  userRole?: string
  actorType?: 'crm_user' | 'map_user' | 'auth_attempt'
}

function inferService(path: string): string {
  if (path.includes('/map-auth') || path.includes('/map/')) return 'Map'
  if (path.includes('/auth')) return 'Auth'
  return 'API'
}

function inferEntity(path: string): { entityType?: string; entityId?: string } {
  const parts = path.split('/').filter(Boolean)
  // Route segments compare case-insensitively, as Express matches them; ids keep their case.
  const seg = parts.map(part => part.toLowerCase())
  if (seg[0] !== 'api') return {}

  if (seg[1] === 'map') {
    // The public review routes are keyed by restaurant; 'map_reviews' (the
    // generic branch below) is the moderation route, keyed by review id.
    if (seg[2] === 'restaurants' && seg[4] === 'reviews') {
      return { entityType: 'map_restaurant_reviews', entityId: parts[3] }
    }
    if (seg[2] === 'suggestions') {
      return {
        entityType: 'map_suggestions',
        ...(parts[3] && seg[3] !== 'review' ? { entityId: parts[3] } : {}),
      }
    }
    return seg[2] ? { entityType: `map_${seg[2]}`, ...(parts[3] ? { entityId: parts[3] } : {}) } : { entityType: 'map' }
  }

  if (seg[1] === 'map-auth') return { entityType: 'map_auth' }
  if (seg[1] === 'auth') {
    return {
      entityType: 'auth',
      ...(seg[2] ? { entityId: seg.slice(2).join('/') } : {}),
    }
  }

  const entityType = seg[1]
  const entityId = parts[2]
  if (!entityType) return {}
  return {
    entityType,
    ...(entityId && !ROUTE_ACTION_SEGMENTS.has(seg[2]) ? { entityId } : {}),
  }
}

function isIgnoredPath(path: string): boolean {
  return path === '/health' ||
    path === '/api/openapi.json' ||
    path.startsWith('/api/docs') ||
    path.startsWith('/api/logs')
}

function isPlatformPath(path: string): boolean {
  return path === '/api' || path.startsWith('/api/')
}

function isAuthActionPath(path: string): boolean {
  return path === '/api/auth/login' ||
    path === '/api/auth/logout' ||
    path.startsWith('/api/auth/2fa/') ||
    path === '/api/map-auth/register' ||
    path === '/api/map-auth/login' ||
    path === '/api/map-auth/oauth' ||
    path.startsWith('/api/map-auth/password-reset/')
}

function stringFromBody(req: Request, key: string): string | undefined {
  const body = req.body as Record<string, unknown> | undefined
  const value = body?.[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function inferAttemptedActor(req: Request): ServiceLogActor | undefined {
  const email = stringFromBody(req, 'email')
  if (email) {
    return { userEmail: email.toLowerCase(), userRole: 'auth_attempt', actorType: 'auth_attempt' }
  }

  const channel = stringFromBody(req, 'channel')
  const identifier = stringFromBody(req, 'identifier')
  if (channel === 'email' && identifier) {
    return { userEmail: identifier.toLowerCase(), userRole: 'auth_attempt', actorType: 'auth_attempt' }
  }

  return undefined
}

function actorFromRequest(req: Request, res: Response, key: string): ServiceLogActor | undefined {
  const explicit = res.locals.serviceLogActor as ServiceLogActor | undefined
  if (explicit?.userId || explicit?.userEmail) return explicit

  if (req.user) {
    return {
      userId: req.user.sub,
      userEmail: req.user.email,
      userRole: req.user.role,
      actorType: 'crm_user',
    }
  }

  if (req.mapUser) {
    return {
      userId: req.mapUser.sub,
      userEmail: req.mapUser.email,
      userRole: 'map_user',
      actorType: 'map_user',
    }
  }

  // A rate-limited attempt is still logged, but its body is not read: the
  // limiter never looked at it, and the rows before the limit already carry
  // the attempted email.
  return isAuthActionPath(key) && res.statusCode !== 429 ? inferAttemptedActor(req) : undefined
}

function shouldCapture(req: Request, key: string, statusCode: number, actor?: ServiceLogActor): boolean {
  if (isIgnoredPath(key) || !isPlatformPath(key)) return false

  if (statusCode >= 500) return true
  if (statusCode >= 400) return Boolean(actor) || isAuthActionPath(key)

  return MUTATING_METHODS.has(req.method) && (Boolean(actor) || isAuthActionPath(key))
}

function sanitizedQuery(req: Request): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(req.query).map(([key, value]) => [
      key,
      SENSITIVE_METADATA_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  )
}

const AUTH_PATH_MESSAGES: Record<string, string> = {
  '/api/auth/login':                      'CRM login succeeded',
  '/api/auth/logout':                     'CRM logout succeeded',
  '/api/auth/2fa/setup':                  '2FA setup started',
  '/api/auth/2fa/enable':                 '2FA enabled',
  '/api/auth/2fa/disable':                '2FA disabled',
  '/api/auth/2fa/verify':                 'CRM 2FA login succeeded',
  '/api/auth/2fa/verify-backup':          'CRM backup-code login succeeded',
  '/api/map-auth/register':               'Map user registered',
  '/api/map-auth/login':                  'Map login succeeded',
  '/api/map-auth/oauth':                  'Map OAuth login succeeded',
  '/api/map-auth/password-reset/request': 'Map password reset requested',
  '/api/map-auth/password-reset/confirm': 'Map password reset completed',
}

function messageFor(
  req: Request,
  res: Response,
  path: string,
  key: string,
  entity: { entityType?: string; entityId?: string },
): string {
  if (typeof res.locals.serviceLogMessage === 'string') return res.locals.serviceLogMessage
  if (typeof res.locals.serviceErrorMessage === 'string') return res.locals.serviceErrorMessage

  if (res.statusCode >= 400) return `${req.method} ${path} returned ${res.statusCode}`

  const authMessage = AUTH_PATH_MESSAGES[key]
  if (authMessage) return authMessage

  const verb = req.method === 'POST' ? 'Created'
    : req.method === 'DELETE' ? 'Deleted'
      : req.method === 'PATCH' || req.method === 'PUT' ? 'Updated'
        : req.method
  const target = entity.entityType
    ? `${entity.entityType}${entity.entityId ? `:${entity.entityId}` : ''}`
    : 'platform resource'

  return `${verb} ${target}`
}

// A client-supplied x-request-id is stored in service_logs and echoed back, so
// only a conservative token shape (UUIDs, ULIDs, trace ids) is honoured.
// Anything else (markup, oversized values, comma-joined repeated headers) gets
// a fresh UUID.
const REQUEST_ID_PATTERN = /^[A-Za-z0-9._:-]{8,64}$/

export function resolveRequestId(supplied: string | undefined): string {
  return supplied !== undefined && REQUEST_ID_PATTERN.test(supplied) ? supplied : randomUUID()
}

export function serviceLogger(req: Request, res: Response, next: NextFunction): void {
  // resolveRequestId() both validates the shape and caps the length (64).
  const requestId = resolveRequestId(req.header('x-request-id'))
  const startedAt = Date.now()
  res.setHeader('x-request-id', requestId)
  // Read the path now, while it is still the full '/api/...' path. By 'finish'
  // req.path is relative to the innermost router (Express strips each mount
  // path and restores it only when a handler calls next()), so a response a
  // route handler sends itself would read '/reviews/x' and never be captured.
  // The path is stored as requested; routeKey() is what gets classified.
  const path = clip(req.path, MAX_PATH_LENGTH)
  const key = routeKey(path)

  res.on('finish', () => {
    const actor = actorFromRequest(req, res, key)
    if (!shouldCapture(req, key, res.statusCode, actor)) return

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    const entity = inferEntity(path)

    void serviceLogsRepo.create({
      level,
      service: inferService(key),
      action: `${req.method} ${path}`,
      message: clip(messageFor(req, res, path, key, entity), MAX_MESSAGE_LENGTH),
      userId: actor?.userId,
      userEmail: storableEmail(actor?.userEmail),
      userRole: actor?.userRole,
      method: req.method,
      path,
      statusCode: res.statusCode,
      requestId,
      ...entity,
      metadata: {
        actorType: actor?.actorType,
        durationMs: Date.now() - startedAt,
        ip: req.ip,
        query: sanitizedQuery(req),
      },
    }).catch(() => undefined)
  })

  next()
}
