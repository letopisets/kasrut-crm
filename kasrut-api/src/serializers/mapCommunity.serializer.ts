import type { MapUserRow } from '../db/mapCommunity.repo'

export const serializeMapUser = (u: MapUserRow) => ({
  id: u.id,
  email: u.email,
  phone: u.phone,
  firstName: u.firstName,
  lastName: u.lastName,
  name: u.name,
  avatarUrl: u.avatarUrl,
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
}) => ({
  ratingAvg: payload.ratingAvg,
  reviewCount: payload.reviewCount,
  reviews: payload.reviews.map(serializeMapReview),
})
