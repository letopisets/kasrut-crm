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
