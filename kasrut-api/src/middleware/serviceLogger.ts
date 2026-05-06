import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { serviceLogsRepo } from '../db/serviceLogs.repo'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const ROUTE_ACTION_SEGMENTS = new Set(['assign', 'review', 'reviews', 'toggle'])
const SENSITIVE_METADATA_KEYS = new Set(['authorization', 'backupcode', 'code', 'idtoken', 'password', 'temptoken', 'token'])

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
  if (parts[0] !== 'api') return {}

  if (parts[1] === 'map') {
    if (parts[2] === 'restaurants' && parts[4] === 'reviews') {
      return { entityType: 'map_reviews', entityId: parts[3] }
    }
    if (parts[2] === 'suggestions') {
      return {
        entityType: 'map_suggestions',
        ...(parts[3] && parts[3] !== 'review' ? { entityId: parts[3] } : {}),
      }
    }
    return parts[2] ? { entityType: `map_${parts[2]}`, ...(parts[3] ? { entityId: parts[3] } : {}) } : { entityType: 'map' }
  }

  if (parts[1] === 'map-auth') return { entityType: 'map_auth' }
  if (parts[1] === 'auth') {
    return {
      entityType: 'auth',
      ...(parts[2] ? { entityId: parts.slice(2).join('/') } : {}),
    }
  }

  const entityType = parts[1]
  const entityId = parts[2]
  if (!entityType) return {}
  return {
    entityType,
    ...(entityId && !ROUTE_ACTION_SEGMENTS.has(entityId) ? { entityId } : {}),
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

function actorFromRequest(req: Request, res: Response): ServiceLogActor | undefined {
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

  return isAuthActionPath(req.path) ? inferAttemptedActor(req) : undefined
}

function shouldCapture(req: Request, statusCode: number, actor?: ServiceLogActor): boolean {
  if (isIgnoredPath(req.path) || !isPlatformPath(req.path)) return false

  if (statusCode >= 500) return true
  if (statusCode >= 400) return Boolean(actor) || isAuthActionPath(req.path)

  return MUTATING_METHODS.has(req.method) && (Boolean(actor) || isAuthActionPath(req.path))
}

function sanitizedQuery(req: Request): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(req.query).map(([key, value]) => [
      key,
      SENSITIVE_METADATA_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value,
    ]),
  )
}

function messageFor(req: Request, res: Response, entity: { entityType?: string; entityId?: string }): string {
  if (typeof res.locals.serviceLogMessage === 'string') return res.locals.serviceLogMessage
  if (typeof res.locals.serviceErrorMessage === 'string') return res.locals.serviceErrorMessage

  if (res.statusCode >= 400) return `${req.method} ${req.path} returned ${res.statusCode}`

  if (req.path === '/api/auth/login') return 'CRM login succeeded'
  if (req.path === '/api/auth/logout') return 'CRM logout succeeded'
  if (req.path === '/api/auth/2fa/setup') return '2FA setup started'
  if (req.path === '/api/auth/2fa/enable') return '2FA enabled'
  if (req.path === '/api/auth/2fa/disable') return '2FA disabled'
  if (req.path === '/api/auth/2fa/verify') return 'CRM 2FA login succeeded'
  if (req.path === '/api/auth/2fa/verify-backup') return 'CRM backup-code login succeeded'
  if (req.path === '/api/map-auth/register') return 'Map user registered'
  if (req.path === '/api/map-auth/login') return 'Map login succeeded'
  if (req.path === '/api/map-auth/oauth') return 'Map OAuth login succeeded'
  if (req.path === '/api/map-auth/password-reset/request') return 'Map password reset requested'
  if (req.path === '/api/map-auth/password-reset/confirm') return 'Map password reset completed'

  const verb = req.method === 'POST' ? 'Created'
    : req.method === 'DELETE' ? 'Deleted'
      : req.method === 'PATCH' || req.method === 'PUT' ? 'Updated'
        : req.method
  const target = entity.entityType
    ? `${entity.entityType}${entity.entityId ? `:${entity.entityId}` : ''}`
    : 'platform resource'

  return `${verb} ${target}`
}

export function serviceLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') || randomUUID()
  const startedAt = Date.now()
  res.setHeader('x-request-id', requestId)

  res.on('finish', () => {
    const actor = actorFromRequest(req, res)
    if (!shouldCapture(req, res.statusCode, actor)) return

    const level = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info'
    const entity = inferEntity(req.path)

    void serviceLogsRepo.create({
      level,
      service: inferService(req.path),
      action: `${req.method} ${req.path}`,
      message: messageFor(req, res, entity),
      userId: actor?.userId,
      userEmail: actor?.userEmail,
      userRole: actor?.userRole,
      method: req.method,
      path: req.path,
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
