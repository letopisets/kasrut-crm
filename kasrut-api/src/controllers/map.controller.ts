import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { mapRepo }                  from '../db/map.repo'
import { mapCommunityRepo }         from '../db/mapCommunity.repo'
import { serializeMapRestaurants }  from '../serializers/map.serializer'
import {
  serializeMapReview,
  serializeMapReviewsPayload,
  serializeMapSuggestion,
} from '../serializers/mapCommunity.serializer'
import { withCache }                from '../lib/cache'
import type { KashrutLevel, MapFilter } from '../db/map.repo'

const HECHSHERIM_CACHE_TTL = 600 // 10 minutes

const CACHE_TTL = 300 // 5 minutes

function parseCsv<T extends string>(value: string | undefined): T[] | undefined {
  if (!value) return undefined
  const parts = value.split(',').map(s => s.trim()).filter(Boolean) as T[]
  return parts.length ? parts : undefined
}

const suggestionSchema = z.object({
  type: z.enum(['add', 'update']),
  restaurantId: z.string().optional().nullable(),
  proposedName: z.string().trim().min(1).max(160).optional().nullable(),
  proposedAddress: z.string().trim().min(1).max(220).optional().nullable(),
  proposedCity: z.string().trim().min(1).max(120).optional().nullable(),
  proposedHechsher: z.string().trim().min(1).max(180).optional().nullable(),
  proposedKashrutStatus: z.string().trim().min(1).max(120).optional().nullable(),
  proposedLat: z.number().finite().optional().nullable(),
  proposedLng: z.number().finite().optional().nullable(),
  notes: z.string().trim().max(1200).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.type === 'add') {
    if (!value.proposedName || !value.proposedAddress || !value.proposedCity) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'Name, address and city are required for a new restaurant' })
    }
    return
  }

  if (!value.restaurantId) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'restaurantId is required for an update suggestion' })
  }

  const hasChange = Boolean(
    value.proposedName ||
    value.proposedAddress ||
    value.proposedCity ||
    value.proposedHechsher ||
    value.proposedKashrutStatus ||
    value.notes,
  )
  if (!hasChange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one proposed change is required' })
  }
})

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional().nullable(),
})

export const mapController = {
  async listHechsherim(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const data = await withCache('map:hechsherim', HECHSHERIM_CACHE_TTL, () =>
        mapRepo.findHechsherim()
      )
      res.json(data)
    } catch (e) { next(e) }
  },

  async listRestaurants(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const q = req.query as Record<string, string>

      const filter: MapFilter = {
        city:         q.city     || undefined,
        kashrutLevel: parseCsv<KashrutLevel>(q.kashrutLevel),
        hechsher:     parseCsv(q.hechsher),
        foodType:     parseCsv(q.foodType),
      }

      // Build a stable cache key from the filter
      const cacheKey = `map:restaurants:${JSON.stringify(filter)}`

      const data = await withCache(cacheKey, CACHE_TTL, () =>
        mapRepo.findForMap(filter)
      )

      res.json(serializeMapRestaurants(data))
    } catch (e) { next(e) }
  },

  async createSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.mapUser) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const parsed = suggestionSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'Invalid suggestion payload' })
        return
      }

      if (parsed.data.restaurantId) {
        const exists = await mapCommunityRepo.restaurantExists(parsed.data.restaurantId)
        if (!exists) {
          res.status(404).json({ error: 'Restaurant not found' })
          return
        }
      }

      const suggestion = await mapCommunityRepo.createSuggestion(req.mapUser.sub, parsed.data)
      res.status(201).json(serializeMapSuggestion(suggestion))
    } catch (e) { next(e) }
  },

  async listReviews(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const restaurantId = req.params.restaurantId
      const exists = await mapCommunityRepo.restaurantExists(restaurantId)
      if (!exists) {
        res.status(404).json({ error: 'Restaurant not found' })
        return
      }

      const payload = await mapCommunityRepo.listReviews(restaurantId)
      res.json(serializeMapReviewsPayload(payload))
    } catch (e) { next(e) }
  },

  async upsertReview(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      if (!req.mapUser) {
        res.status(401).json({ error: 'Unauthorized' })
        return
      }

      const parsed = reviewSchema.safeParse(req.body)
      if (!parsed.success) {
        res.status(400).json({ error: 'rating must be between 1 and 5' })
        return
      }

      const review = await mapCommunityRepo.upsertReview(req.mapUser.sub, req.params.restaurantId, parsed.data)
      if (!review) {
        res.status(404).json({ error: 'Restaurant not found' })
        return
      }
      res.json(serializeMapReview(review))
    } catch (e) { next(e) }
  },
}
