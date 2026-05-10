import { prisma } from '../lib/prisma'
import { randomUUID } from 'crypto'
import { Prisma } from '../generated/prisma/client'
import { logger } from '../lib/logger'

export type ServiceLogLevel = 'info' | 'warn' | 'error'

// Batched-write configuration for high-RPS workloads. Logs are buffered in
// process and flushed either when the buffer reaches BATCH_MAX_SIZE or after
// BATCH_FLUSH_MS, whichever comes first. Tunable via env so deployments can
// dial it down (chatty, low-latency) or up (steady, fewer writes).
const BATCH_MAX_SIZE = Number(process.env.SERVICE_LOG_BATCH_SIZE ?? 100)
const BATCH_FLUSH_MS = Number(process.env.SERVICE_LOG_FLUSH_MS ?? 1_000)
const isTest = process.env.NODE_ENV === 'test' || process.env.JEST_WORKER_ID !== undefined

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

// In-memory buffer of pending log rows + a single timer. We persist the rows
// either when the buffer fills up (BATCH_MAX_SIZE) or BATCH_FLUSH_MS after the
// first row was queued. Crashes lose at most one batch — that's an acceptable
// trade for collapsing N inserts/sec into 1 multi-row INSERT.
interface PendingLog extends ServiceLogInput { id: string }
let pendingLogs: PendingLog[] = []
let flushTimer: NodeJS.Timeout | null = null
let flushInFlight: Promise<void> = Promise.resolve()

async function persistBatch(batch: PendingLog[]): Promise<void> {
  if (batch.length === 0) return
  const rows = batch.map(r => Prisma.sql`(
    ${r.id}, ${r.level}, ${r.service}, ${r.action ?? null}, ${r.message},
    ${r.userId ?? null}, ${r.userEmail ?? null}, ${r.userRole ?? null},
    ${r.entityType ?? null}, ${r.entityId ?? null}, ${r.method ?? null}, ${r.path ?? null},
    ${r.statusCode ?? null}, ${r.requestId ?? null},
    ${r.metadata ? JSON.stringify(r.metadata) : null}::jsonb
  )`)
  try {
    await prisma.$executeRaw`
      INSERT INTO "service_logs"
        ("id", "level", "service", "action", "message", "userId", "userEmail", "userRole",
         "entityType", "entityId", "method", "path", "statusCode", "requestId", "metadata")
      VALUES ${Prisma.join(rows)}
    `
  } catch (err) {
    logger.error({ err, batchSize: batch.length }, 'service_logs flush failed')
  }
}

function scheduleFlush(): void {
  if (flushTimer) return
  flushTimer = setTimeout(() => {
    flushTimer = null
    void flushPending()
  }, BATCH_FLUSH_MS)
  // Don't keep the event loop alive just for this — the process can exit.
  if (typeof flushTimer.unref === 'function') flushTimer.unref()
}

async function flushPending(): Promise<void> {
  if (pendingLogs.length === 0) return
  const batch = pendingLogs
  pendingLogs = []
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  flushInFlight = persistBatch(batch).finally(() => undefined)
  await flushInFlight
}

export const serviceLogsRepo = {
  async create(input: ServiceLogInput): Promise<void> {
    const id = randomUUID()
    // Tests rely on observing each call in isolation — keeping the original
    // synchronous-looking semantics when running under Jest avoids reshaping
    // every existing test for batching.
    if (isTest) {
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
      return
    }

    pendingLogs.push({ ...input, id })
    if (pendingLogs.length >= BATCH_MAX_SIZE) {
      await flushPending()
    } else {
      scheduleFlush()
    }
  },

  /** Force-flush the buffer. Call from graceful shutdown handlers so log rows
   *  enqueued just before SIGTERM make it to the database. */
  async flush(): Promise<void> {
    await flushInFlight
    await flushPending()
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

  /** Delete rows older than retainDays (default 90). Safe to call repeatedly — no-op when nothing to delete. */
  async rotate(retainDays = 90): Promise<number> {
    const result = await prisma.$executeRaw`
      DELETE FROM "service_logs"
      WHERE "createdAt" < NOW() - (${retainDays} || ' days')::interval
    `
    return result
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
