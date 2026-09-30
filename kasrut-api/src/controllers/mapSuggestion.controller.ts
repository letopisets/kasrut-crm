import { z } from 'zod'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import {
  serializeMapSuggestion,
  serializeMapSuggestionFull,
} from '../serializers/mapCommunity.serializer'
import { invalidateMapCache } from '../lib/mapCache'
import { asyncHandler } from '../lib/asyncHandler'
import { CoordinateValidationError } from '../lib/geoValidation'
import { ForbiddenScopeError, resolveScopeRabbanutId } from '../lib/rabbanutScope'
import { isEntityId } from '../lib/entityId'

const MAX_SUGGESTION_IMAGE_BYTES = 512 * 1024
const MAX_PENDING_SUGGESTIONS_PER_USER = 5
const SUGGESTION_IMAGE_PATTERN = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/

function isAllowedImageDataUrl(value: string): boolean {
  const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value)
  if (!match) return false

  const [, kind, encoded] = match
  const bytes = Buffer.from(encoded, 'base64')
  if (bytes.length === 0 || bytes.length > MAX_SUGGESTION_IMAGE_BYTES) return false

  if (kind === 'jpeg') {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff
  }
  if (kind === 'png') {
    return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  }
  return bytes.length >= 12 &&
    bytes.subarray(0, 4).toString('ascii') === 'RIFF' &&
    bytes.subarray(8, 12).toString('ascii') === 'WEBP'
}

const suggestionSchema = z.object({
  type: z.enum(['add', 'update']),
  restaurantId: z.string().optional().nullable(),
  proposedName: z.string().trim().min(1).max(160).optional().nullable(),
  proposedAddress: z.string().trim().min(1).max(220).optional().nullable(),
  proposedCity: z.string().trim().min(1).max(120).optional().nullable(),
  proposedHechsher: z.string().trim().min(1).max(180).optional().nullable(),
  proposedKashrutStatus: z.string().trim().min(1).max(120).optional().nullable(),
  proposedFoodType: z.enum(['meat', 'dairy', 'pareve', 'takeaway']).optional().nullable(),
  proposedCategory: z.string().trim().min(1).max(40).optional().nullable(),
  proposedImageUrl: z.string()
    .max(Math.ceil(MAX_SUGGESTION_IMAGE_BYTES * 4 / 3) + 64, 'Image is too large')
    .regex(SUGGESTION_IMAGE_PATTERN, 'Image must be a JPEG, PNG or WebP data URL')
    .refine(isAllowedImageDataUrl, 'Image content is invalid or too large')
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
    value.proposedName || value.proposedAddress || value.proposedCity ||
    value.proposedHechsher || value.proposedKashrutStatus || value.proposedFoodType ||
    value.proposedCategory || value.proposedImageUrl || value.notes,
  )
  if (!hasChange) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: 'At least one proposed change is required' })
  }
})

export const mapSuggestionController = {
  createSuggestion: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const parsed = suggestionSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'Invalid suggestion payload' }); return }

    if (parsed.data.restaurantId) {
      // Same id rule as the map's by-id reads: a shape no row can have 404s
      // without a query.
      if (!isEntityId(parsed.data.restaurantId)) { res.status(404).json({ error: 'Restaurant not found' }); return }
      const exists = await mapCommunityRepo.restaurantExists(parsed.data.restaurantId)
      if (!exists) { res.status(404).json({ error: 'Restaurant not found' }); return }
    }

    const suggestion = await mapCommunityRepo.createSuggestionWithinQuota(
      req.mapUser.sub,
      parsed.data,
      MAX_PENDING_SUGGESTIONS_PER_USER,
    )
    if (!suggestion) {
      res.status(429).json({ error: 'Resolve existing pending suggestions before submitting another.' })
      return
    }

    res.status(201).json(serializeMapSuggestion(suggestion))
  }),

  listSuggestions: asyncHandler(async (req, res) => {
    const reviewerRole = req.user?.role
    if (reviewerRole !== 'owner' && reviewerRole !== 'rabbanut') {
      throw new ForbiddenScopeError()
    }

    const status  = req.query.status as string | undefined
    const allowed = ['pending', 'approved', 'rejected']
    const statusFilter = allowed.includes(status ?? '')
      ? status as 'pending' | 'approved' | 'rejected'
      : undefined
    const suggestions = await mapCommunityRepo.listSuggestions({
      ...(statusFilter ? { status: statusFilter } : {}),
      reviewerRole,
      reviewerRabbanutId: resolveScopeRabbanutId(req),
    })
    const viewer = { includeEmail: reviewerRole === 'owner' }
    res.json(suggestions.map(s => serializeMapSuggestionFull(s, viewer)))
  }),

  reviewSuggestion: asyncHandler(async (req, res) => {
    const reviewerRole = req.user?.role
    if (reviewerRole !== 'owner' && reviewerRole !== 'rabbanut') {
      throw new ForbiddenScopeError()
    }

    const id = req.params.id
    const { status, reviewerNote } = req.body as { status?: unknown; reviewerNote?: unknown }
    if (status !== 'approved' && status !== 'rejected') {
      res.status(400).json({ error: 'status must be "approved" or "rejected"' }); return
    }
    const note = typeof reviewerNote === 'string' ? reviewerNote.trim() || null : null
    try {
      const result = await mapCommunityRepo.reviewSuggestion(id, {
        status,
        reviewerNote: note,
        reviewerRole,
        reviewerRabbanutId: resolveScopeRabbanutId(req),
      })
      if (!result) { res.status(404).json({ error: 'Suggestion not found or already reviewed' }); return }
      if (status === 'approved') await invalidateMapCache()
      res.json(serializeMapSuggestionFull(result, { includeEmail: reviewerRole === 'owner' }))
    } catch (e) {
      if (e instanceof CoordinateValidationError) {
        res.status(400).json({ error: e.message }); return
      }
      if (e instanceof Error && e.message.startsWith('Cannot approve suggestion')) {
        res.status(400).json({ error: e.message }); return
      }
      throw e
    }
  }),
}
