import type { Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import {
  serializeMapSuggestion,
  serializeMapSuggestionFull,
} from '../serializers/mapCommunity.serializer'
import { invalidateMapCache } from '../lib/mapCache'

// Capped well below the 2 MB body limit so any other request fields still fit.
const MAX_SUGGESTION_IMAGE_BYTES = 1_400_000
const SUGGESTION_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

const suggestionSchema = z.object({
  type: z.enum(['add', 'update']),
  restaurantId: z.string().optional().nullable(),
  proposedName: z.string().trim().min(1).max(160).optional().nullable(),
  proposedAddress: z.string().trim().min(1).max(220).optional().nullable(),
  proposedCity: z.string().trim().min(1).max(120).optional().nullable(),
  proposedHechsher: z.string().trim().min(1).max(180).optional().nullable(),
  proposedKashrutStatus: z.string().trim().min(1).max(120).optional().nullable(),
  proposedFoodType: z.enum(['meat', 'dairy', 'pareve', 'takeaway']).optional().nullable(),
  proposedImageUrl: z.string()
    .max(MAX_SUGGESTION_IMAGE_BYTES, 'Image is too large')
    .regex(SUGGESTION_IMAGE_PATTERN, 'Image must be a JPEG, PNG or WebP data URL')
    .optional()
    .nullable(),
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
    value.proposedFoodType ||
    value.proposedImageUrl ||
    value.notes,
  )
  if (!hasChange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one proposed change is required' })
  }
})

export const mapSuggestionController = {
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

  async listSuggestions(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = req.query.status as string | undefined
      const allowed = ['pending', 'approved', 'rejected']
      const filter = allowed.includes(status ?? '') ? { status: status as 'pending' | 'approved' | 'rejected' } : {}
      const suggestions = await mapCommunityRepo.listSuggestions(filter)
      res.json(suggestions.map(serializeMapSuggestionFull))
    } catch (e) { next(e) }
  },

  async reviewSuggestion(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id
      const { status, reviewerNote } = req.body as { status?: unknown; reviewerNote?: unknown }
      if (status !== 'approved' && status !== 'rejected') {
        res.status(400).json({ error: 'status must be "approved" or "rejected"' })
        return
      }
      const note = typeof reviewerNote === 'string' ? reviewerNote.trim() || null : null
      const result = await mapCommunityRepo.reviewSuggestion(id, {
        status,
        reviewerNote: note,
        reviewerRabbanutId: req.user?.rabbanutId,
      })
      if (!result) {
        res.status(404).json({ error: 'Suggestion not found or already reviewed' })
        return
      }
      if (status === 'approved') await invalidateMapCache()
      res.json(serializeMapSuggestionFull(result))
    } catch (e) {
      if (e instanceof Error && e.message.startsWith('Cannot approve suggestion')) {
        res.status(400).json({ error: e.message })
        return
      }
      next(e)
    }
  },
}
