import { Router } from 'express'
import { asyncHandler }   from '../lib/asyncHandler'
import { authenticateJWT } from '../middleware/auth'
import { prisma }          from '../lib/prisma'
import { withCache }       from '../lib/cache'
import { resolveScopeRabbanutId } from '../lib/rabbanutScope'

const router = Router()

router.get('/summary', authenticateJWT, asyncHandler(async (req, res) => {
  const rabbanutId = resolveScopeRabbanutId(req, undefined)
  const cacheKey   = `dashboard:summary:${rabbanutId ?? 'all'}`

  const data = await withCache(cacheKey, 60, async () => {
    const now          = new Date()
    const in30days     = new Date(now.getTime() + 30 * 86_400_000)
    const todayStart   = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z')
    const todayEnd     = new Date(now.toISOString().slice(0, 10) + 'T23:59:59.999Z')

    const scope = rabbanutId ? { rabbanutId } : {}

    const [activeRestaurants, expiringSoon, openInspections, logsToday] = await Promise.all([
      prisma.restaurant.count({ where: { ...scope, deletedAt: null, expires: { gt: now } } }),

      prisma.restaurant.count({
        where: { ...scope, deletedAt: null, expires: { gt: now, lte: in30days } },
      }),

      prisma.inspection.count({
        where: {
          result: { in: ['pending', 'open'] },
          ...(rabbanutId ? { restaurant: { rabbanutId } } : {}),
        },
      }),

      prisma.serviceLog.count({
        where: { createdAt: { gte: todayStart, lte: todayEnd } },
      }),
    ])

    return { activeRestaurants, expiringSoon, openInspections, logsToday }
  })

  res.json(data)
}))

export default router
