export type { FoodType, MapAuthProvider, MapSuggestionType, MapSuggestionStatus, MapPasswordResetChannel as PasswordResetChannel, Page } from '../../../packages/shared/types'
import type { FoodType, MapAuthProvider, MapSuggestionType, MapSuggestionStatus } from '../../../packages/shared/types'

export type KashrutLevel = 'mehadrin' | 'badatz' | 'regular'

export interface MapHechsher {
  id:        string
  name:      string
  shortName: string
}

export interface MapRestaurant {
  id:           string
  name:         string
  address:      string
  city:         string
  lat:          number
  lng:          number
  foodType:     FoodType
  category:     string | null   // EstablishmentCategory.slug — вид заведения
  kashrutLevel: KashrutLevel
  hechsher:     string
  phone?:       string
  hours?:       string
  distance?:    number   // metres, computed at runtime
}

export interface MapBounds {
  north: number
  south: number
  east:  number
  west:  number
}

export interface MapViewport {
  bounds: MapBounds
  zoom:   number
}

export interface MapRestaurantQuery extends MapFilters {
  q?:           string   // free-text search over name/address/city
  viewport:     MapViewport | null
  userPosition: [number, number] | null
  limit:        number
}

export interface MapRestaurantsResponse {
  restaurants: MapRestaurant[]
  total:       number
  limit:       number
  limited:     boolean
}

export interface MapCategoryOption {
  id:     string
  slug:   string
  nameHe: string
  nameEn: string | null
  nameRu: string | null
}

export interface MapOptions {
  cities:     string[]
  hechshers:  string[]
  categories: MapCategoryOption[]
}

export interface MapUser {
  id: string
  email: string
  phone: string | null
  firstName: string | null
  lastName: string | null
  name: string
  avatarUrl: string | null
}

export interface MapAuthProviderConfig {
  provider: MapAuthProvider
  enabled: boolean
  clientId: string | null
}

export interface MapAuthConfig {
  providers: MapAuthProviderConfig[]
}

export interface MapAuthResponse {
  user: MapUser
  token: string
}

export interface PasswordResetRequestResponse {
  ok: boolean
  message: string
  devResetToken?: string
}

export interface MapSuggestionPayload {
  type: MapSuggestionType
  restaurantId?: string | null
  proposedName?: string | null
  proposedAddress?: string | null
  proposedCity?: string | null
  proposedHechsher?: string | null
  proposedKashrutStatus?: string | null
  proposedFoodType?: FoodType | null
  proposedCategory?: string | null   // EstablishmentCategory.slug — вид
  proposedImageUrl?: string | null
  proposedLat?: number | null
  proposedLng?: number | null
  notes?: string | null
}

export interface MapSuggestion extends MapSuggestionPayload {
  id: string
  status: MapSuggestionStatus
  createdAt: string
}

export interface MapReview {
  id: string
  restaurantId: string
  rating: number
  text: string | null
  createdAt: string
  updatedAt: string
  user: {
    id: string
    name: string
    avatarUrl: string | null
  }
}

export interface MapReviewsPayload {
  ratingAvg: number | null
  reviewCount: number
  reviews: MapReview[]
}

export interface MapFilters {
  hechsher: string[]
  foodType: FoodType[]
  category: string[]     // EstablishmentCategory.slug values; [] = all kinds
  city:     string       // '' = all cities (no filter)
  radius:   number | null  // metres; null = viewport only
}

export interface RouteStep {
  instruction: string
  distance:    number   // metres
  duration:    number   // seconds
}

export interface RouteData {
  geometry:      [number, number][]  // [lat, lng] pairs
  steps:         RouteStep[]
  totalDistance: number
  totalDuration: number
}
