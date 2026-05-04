import type { FoodType } from './restaurant'

export type SuggestionStatus = 'pending' | 'approved' | 'rejected'
export type SuggestionType   = 'add' | 'update'

export interface MapSuggestion {
  id: string
  type: SuggestionType
  status: SuggestionStatus
  restaurantId: string | null
  proposedName: string | null
  proposedAddress: string | null
  proposedCity: string | null
  proposedHechsher: string | null
  proposedKashrutStatus: string | null
  proposedFoodType: FoodType | null
  proposedImageUrl: string | null
  proposedLat: number | null
  proposedLng: number | null
  notes: string | null
  reviewerNote: string | null
  reviewedAt: string | null
  createdAt: string
  user: { id: string; name: string; email: string } | null
}
