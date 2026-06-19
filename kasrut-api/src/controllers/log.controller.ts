import { serviceLogsRepo, type ServiceLogLevel } from '../db/serviceLogs.repo'
import { asyncHandler } from '../lib/asyncHandler'

const LEVELS = new Set(['info', 'warn', 'error'])

export const logController = {
  list: asyncHandler(async (req, res) => {
    const q = req.query as Record<string, string | undefined>
    const level = LEVELS.has(q.level ?? '') ? q.level as ServiceLogLevel : undefined
    const limit = q.limit ? Number(q.limit) : undefined
    const [logs, summary] = await Promise.all([
      serviceLogsRepo.findRecent({
        level,
        service: q.service || undefined,
        userId: q.userId || undefined,
        limit: Number.isFinite(limit) ? limit : undefined,
      }),
      serviceLogsRepo.summary24h(),
    ])
    res.json({ logs, summary })
  }),
}
