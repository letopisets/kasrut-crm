import type { Request, Response, NextFunction } from 'express'
import { randomUUID } from 'crypto'
import { serviceLogsRepo } from '../db/serviceLogs.repo'

function inferService(path: string): string {
  if (path.includes('/map-auth') || path.includes('/map/')) return 'Map'
  if (path.includes('/auth')) return 'Auth'
  return 'API'
}

function inferEntity(path: string): { entityType?: string; entityId?: string } {
  const parts = path.split('/').filter(Boolean)
  const apiIndex = parts[0] === 'api' ? 1 : 0
  const entityType = parts[apiIndex]
  const entityId = parts[apiIndex + 1]
  if (!entityType) return {}
  return {
    entityType,
    ...(entityId && !['review', 'toggle', 'assign'].includes(entityId) ? { entityId } : {}),
  }
}

export function serviceLogger(req: Request, res: Response, next: NextFunction): void {
  const requestId = req.header('x-request-id') || randomUUID()
  res.setHeader('x-request-id', requestId)

  res.on('finish', () => {
    if (req.path === '/health' || req.path.startsWith('/api/logs')) return
    if (res.statusCode < 400) return

    const level = res.statusCode >= 500 ? 'error' : 'warn'
    const entity = inferEntity(req.path)
    const message = typeof res.locals.serviceErrorMessage === 'string'
      ? res.locals.serviceErrorMessage
      : `${req.method} ${req.path} returned ${res.statusCode}`

    void serviceLogsRepo.create({
      level,
      service: inferService(req.path),
      action: `${req.method} ${req.path}`,
      message,
      userId: req.user?.sub,
      userEmail: req.user?.email,
      userRole: req.user?.role,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      requestId,
      ...entity,
      metadata: {
        query: req.query,
        ip: req.ip,
      },
    }).catch(() => undefined)
  })

  next()
}
