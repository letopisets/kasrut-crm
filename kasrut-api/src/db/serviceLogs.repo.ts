import { prisma } from '../lib/prisma'
import { randomUUID } from 'crypto'

export type ServiceLogLevel = 'info' | 'warn' | 'error'

export interface ServiceLog {
  id: string
  createdAt: string
  level: ServiceLogLevel
  service: string
  action?: string
  message: string
  userId?: string
  userEmail?: string
  userRole?: string
  entityType?: string
  entityId?: string
  method?: string
  path?: string
  statusCode?: number
  requestId?: string
  metadata?: unknown
}

export interface ServiceLogInput {
  level: ServiceLogLevel
  service: string
  action?: string
  message: string
  userId?: string
  userEmail?: string
  userRole?: string
  entityType?: string
  entityId?: string
  method?: string
  path?: string
  statusCode?: number
  requestId?: string
  metadata?: unknown
}

export interface ServiceLogFilter {
  level?: ServiceLogLevel
  service?: string
  userId?: string
  limit?: number
}

function toLog(row: Record<string, unknown>): ServiceLog {
  return {
    id: String(row.id),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    level: row.level as ServiceLogLevel,
    service: String(row.service),
    ...(row.action ? { action: String(row.action) } : {}),
    message: String(row.message),
    ...(row.userId ? { userId: String(row.userId) } : {}),
    ...(row.userEmail ? { userEmail: String(row.userEmail) } : {}),
    ...(row.userRole ? { userRole: String(row.userRole) } : {}),
    ...(row.entityType ? { entityType: String(row.entityType) } : {}),
    ...(row.entityId ? { entityId: String(row.entityId) } : {}),
    ...(row.method ? { method: String(row.method) } : {}),
    ...(row.path ? { path: String(row.path) } : {}),
    ...(typeof row.statusCode === 'number' ? { statusCode: row.statusCode } : {}),
    ...(row.requestId ? { requestId: String(row.requestId) } : {}),
    ...(row.metadata ? { metadata: row.metadata } : {}),
  }
}

export const serviceLogsRepo = {
  async create(input: ServiceLogInput): Promise<void> {
    const id = randomUUID()
    await prisma.$executeRaw`
      INSERT INTO "service_logs"
        ("id", "level", "service", "action", "message", "userId", "userEmail", "userRole",
         "entityType", "entityId", "method", "path", "statusCode", "requestId", "metadata")
      VALUES
        (${id}, ${input.level}, ${input.service}, ${input.action ?? null}, ${input.message},
         ${input.userId ?? null}, ${input.userEmail ?? null}, ${input.userRole ?? null},
         ${input.entityType ?? null}, ${input.entityId ?? null}, ${input.method ?? null}, ${input.path ?? null},
         ${input.statusCode ?? null}, ${input.requestId ?? null}, ${input.metadata ? JSON.stringify(input.metadata) : null}::jsonb)
    `
  },

  async findRecent(filter: ServiceLogFilter = {}): Promise<ServiceLog[]> {
    const limit = Math.min(Math.max(filter.limit ?? 100, 1), 500)
    const conditions: string[] = []
    const values: unknown[] = []

    if (filter.level) {
      values.push(filter.level)
      conditions.push(`"level" = $${values.length}`)
    }
    if (filter.service) {
      values.push(filter.service)
      conditions.push(`"service" = $${values.length}`)
    }
    if (filter.userId) {
      values.push(filter.userId)
      conditions.push(`"userId" = $${values.length}`)
    }

    values.push(limit)
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : ''
    const rows = await prisma.$queryRawUnsafe<Record<string, unknown>[]>(
      `SELECT * FROM "service_logs" ${where} ORDER BY "createdAt" DESC LIMIT $${values.length}`,
      ...values,
    )
    return rows.map(toLog)
  },

  async summary24h(): Promise<{ errors24h: number; warnings24h: number; authIssues: number; api5xx: number }> {
    const rows = await prisma.$queryRawUnsafe<Array<{
      errors24h: bigint
      warnings24h: bigint
      authIssues: bigint
      api5xx: bigint
    }>>(`
      SELECT
        COUNT(*) FILTER (WHERE "level" = 'error') AS "errors24h",
        COUNT(*) FILTER (WHERE "level" = 'warn') AS "warnings24h",
        COUNT(*) FILTER (
          WHERE ("path" LIKE '%/auth/%' OR "path" LIKE '%/map-auth/%')
            AND COALESCE("statusCode", 0) >= 400
        ) AS "authIssues",
        COUNT(*) FILTER (WHERE COALESCE("statusCode", 0) >= 500) AS "api5xx"
      FROM "service_logs"
      WHERE "createdAt" >= NOW() - INTERVAL '24 hours'
    `)
    const row = rows[0] ?? { errors24h: 0n, warnings24h: 0n, authIssues: 0n, api5xx: 0n }
    return {
      errors24h: Number(row.errors24h),
      warnings24h: Number(row.warnings24h),
      authIssues: Number(row.authIssues),
      api5xx: Number(row.api5xx),
    }
  },
}
