export type FoodType     = 'meat' | 'dairy' | 'pareve' | 'takeaway'
export type KashrutLevel = 'mehadrin' | 'badatz' | 'regular'

export interface MapRestaurant {
  id:           string
  name:         string
  address:      string
  city:         string
  lat:          number
  lng:          number
  foodType:     FoodType
  kashrutLevel: KashrutLevel
  hechsher:     string
  phone?:       string
  hours?:       string
  distance?:    number   // metres, computed at runtime
}

export type MapAuthProvider = 'google' | 'apple'

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

export type PasswordResetChannel = 'email' | 'phone'

export interface PasswordResetRequestResponse {
  ok: boolean
  message: string
  devResetToken?: string
}

export type MapSuggestionType = 'add' | 'update'
export type MapSuggestionStatus = 'pending' | 'approved' | 'rejected'

export interface MapSuggestionPayload {
  type: MapSuggestionType
  restaurantId?: string | null
  proposedName?: string | null
  proposedAddress?: string | null
  proposedCity?: string | null
  proposedHechsher?: string | null
  proposedKashrutStatus?: string | null
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
  city:     string       // 'Все' = no filter
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
