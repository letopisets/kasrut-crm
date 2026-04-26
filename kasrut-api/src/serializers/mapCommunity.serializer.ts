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

export const serializeMapSuggestion = (s: {
  id: string
  type: string
  status: string
  restaurantId: string | null
  proposedName: string | null
  proposedAddress: string | null
  proposedCity: string | null
  proposedHechsher: string | null
  proposedKashrutStatus: string | null
  proposedLat: number | null
  proposedLng: number | null
  notes: string | null
  createdAt: Date
}) => ({
  id: s.id,
  type: s.type,
  status: s.status,
  restaurantId: s.restaurantId,
  proposedName: s.proposedName,
  proposedAddress: s.proposedAddress,
  proposedCity: s.proposedCity,
  proposedHechsher: s.proposedHechsher,
  proposedKashrutStatus: s.proposedKashrutStatus,
  proposedLat: s.proposedLat,
  proposedLng: s.proposedLng,
  notes: s.notes,
  createdAt: s.createdAt.toISOString(),
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
