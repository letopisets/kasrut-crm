import { z } from 'zod'
import { mapCommunityRepo } from '../db/mapCommunity.repo'
import {
  serializeMapReview,
  serializeMapReviewsPayload,
} from '../serializers/mapCommunity.serializer'
import { asyncHandler } from '../lib/asyncHandler'

const reviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().max(1000).optional().nullable(),
})

export const mapReviewController = {
  listReviews: asyncHandler(async (req, res) => {
    const restaurantId = req.params.restaurantId
    const exists = await mapCommunityRepo.restaurantExists(restaurantId)
    if (!exists) { res.status(404).json({ error: 'Restaurant not found' }); return }
    const payload = await mapCommunityRepo.listReviews(restaurantId)
    res.json(serializeMapReviewsPayload(payload))
  }),

  upsertReview: asyncHandler(async (req, res) => {
    if (!req.mapUser) { res.status(401).json({ error: 'Unauthorized' }); return }

    const parsed = reviewSchema.safeParse(req.body)
    if (!parsed.success) { res.status(400).json({ error: 'rating must be between 1 and 5' }); return }

    const review = await mapCommunityRepo.upsertReview(req.mapUser.sub, req.params.restaurantId, parsed.data)
    if (!review) { res.status(404).json({ error: 'Restaurant not found' }); return }
    res.json(serializeMapReview(review))
  }),
}
