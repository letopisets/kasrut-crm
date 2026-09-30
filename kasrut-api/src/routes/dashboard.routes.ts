import { Router } from 'express'
import { asyncHandler }   from '../lib/asyncHandler'
import { authenticateJWT } from '../middleware/auth'
import { prisma }          from '../lib/prisma'
import { withCache }       from '../lib/cache'
import { ForbiddenScopeError, resolveScopeRabbanutId } from '../lib/rabbanutScope'

const router = Router()

router.get('/summary', authenticateJWT, asyncHandler(async (req, res) => {
  const isOwner     = req.user?.role === 'owner'
  const isMashgiach = req.user?.role === 'mashgiach'
  const mashgiachId = isMashgiach ? req.user?.mashgiachId : undefined
  const rabbanutId  = isMashgiach
    ? req.user?.rabbanutId
    : resolveScopeRabbanutId(req, undefined)
  if (isMashgiach && (!mashgiachId || !rabbanutId)) {
    throw new ForbiddenScopeError()
  }
  const cacheKey = `dashboard:summary:${isOwner
    ? 'owner'
    : isMashgiach
      ? `mashgiach:${rabbanutId}:${mashgiachId}`
      : `rabbanut:${rabbanutId}`}`

  const data = await withCache(cacheKey, 60, async () => {
    const now          = new Date()
    const in30days     = new Date(now.getTime() + 30 * 86_400_000)
    const todayStart   = new Date(now.toISOString().slice(0, 10) + 'T00:00:00.000Z')
    const todayEnd     = new Date(now.toISOString().slice(0, 10) + 'T23:59:59.999Z')

    const restaurantScope = isMashgiach
      ? { rabbanutId: rabbanutId!, mashgiachId: mashgiachId! }
      : rabbanutId
        ? { rabbanutId }
        : {}

    const [activeRestaurants, expiringSoon, openInspections, logsToday] = await Promise.all([
      prisma.restaurant.count({ where: { ...restaurantScope, deletedAt: null, expires: { gt: now } } }),

      prisma.restaurant.count({
        where: { ...restaurantScope, deletedAt: null, expires: { gt: now, lte: in30days } },
      }),

      prisma.inspection.count({
        where: {
          result: { in: ['pending', 'open'] },
          ...(rabbanutId ? { restaurant: { rabbanutId } } : {}),
          ...(isMashgiach ? { mashgiachId: mashgiachId! } : {}),
        },
      }),

      // ServiceLog has no rabbanutId or reliable tenant relation. Returning the
      // global count to a tenant would leak cross-tenant activity, so expose it
      // only to the global owner until the log model gains explicit tenancy.
      // The card counts issues: routine info rows (successful changes, logins)
      // are audit trail, not problems.
      isOwner
        ? prisma.serviceLog.count({
            where: { createdAt: { gte: todayStart, lte: todayEnd }, level: { in: ['warn', 'error'] } },
          })
        : Promise.resolve(undefined),
    ])

    return {
      activeRestaurants,
      expiringSoon,
      openInspections,
      ...(logsToday !== undefined ? { logsToday } : {}),
    }
  })

  res.json(data)
}))

export default router
