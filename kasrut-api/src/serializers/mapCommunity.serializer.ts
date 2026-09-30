import type { MapUserRow } from '../db/mapCommunity.repo'

export const serializeMapUser = (u: MapUserRow) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  firstName: u.firstName,
  lastName: u.lastName,
  name: u.name,
  avatarUrl: u.avatarUrl,
  emailVerified: u.emailVerifiedAt !== null,
})

type SuggestionBase = {
  id: string
  type: string
  status: string
  restaurantId: string | null
  proposedName: string | null
  proposedAddress: string | null
  proposedCity: string | null
  proposedHechsher: string | null
  proposedKashrutStatus: string | null
  proposedFoodType: string | null
  proposedCategory: string | null
  proposedImageUrl: string | null
  proposedLat: number | null
  proposedLng: number | null
  notes: string | null
  createdAt: Date
}

export const serializeMapSuggestion = (s: SuggestionBase) => ({
  id: s.id,
  type: s.type,
  status: s.status,
  restaurantId: s.restaurantId,
  proposedName: s.proposedName,
  proposedAddress: s.proposedAddress,
  proposedCity: s.proposedCity,
  proposedHechsher: s.proposedHechsher,
  proposedKashrutStatus: s.proposedKashrutStatus,
  proposedFoodType: s.proposedFoodType,
  proposedCategory: s.proposedCategory,
  proposedImageUrl: s.proposedImageUrl,
  proposedLat: s.proposedLat,
  proposedLng: s.proposedLng,
  notes: s.notes,
  createdAt: s.createdAt.toISOString(),
})

export const serializeMapSuggestionFull = (s: SuggestionBase & {
  reviewerNote: string | null
  reviewedAt: Date | null
  mapUser: { id: string; name: string; email: string }
}) => ({
  ...serializeMapSuggestion(s),
  reviewerNote: s.reviewerNote,
  reviewedAt: s.reviewedAt?.toISOString() ?? null,
  user: { id: s.mapUser.id, name: s.mapUser.name, email: s.mapUser.email },
})

export const serializeMapReview = (r: {
  id: string
  restaurantId: string
  rating: number
  text: string | null
  createdAt: Date
  updatedAt: Date
  mapUser: { id: string; name: string; avatarUrl: string | null }
}) => ({
  id: r.id,
  restaurantId: r.restaurantId,
  rating: r.rating,
  text: r.text,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  user: {
    id: r.mapUser.id,
    name: r.mapUser.name,
    avatarUrl: r.mapUser.avatarUrl,
  },
})

export const serializeMapReviewsPayload = (payload: {
  reviews: Parameters<typeof serializeMapReview>[0][]
  ratingAvg: number | null
  reviewCount: number
}, nextCursor: string | null) => ({
  ratingAvg: payload.ratingAvg,
  reviewCount: payload.reviewCount,
  reviews: payload.reviews.map(serializeMapReview),
  nextCursor,
})

// CRM moderation view of a review: who wrote it (id + display name, never the
// email) and which restaurant it is about. updatedAt moves when the author
// rewrites the review, so a moderator can tell an edited one apart.
export const serializeModeratedReview = (r: {
  id: string
  rating: number
  text: string | null
  createdAt: Date
  updatedAt: Date
  restaurant: { id: string; name: string }
  mapUser: { id: string; name: string }
}) => ({
  id: r.id,
  rating: r.rating,
  text: r.text,
  createdAt: r.createdAt.toISOString(),
  updatedAt: r.updatedAt.toISOString(),
  restaurant: { id: r.restaurant.id, name: r.restaurant.name },
  author: { id: r.mapUser.id, name: r.mapUser.name },
})
