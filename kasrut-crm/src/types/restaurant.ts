export type { CertStatus, FoodType, RestaurantLevel } from '../../../packages/shared/types'
import type { CertStatus, FoodType, RestaurantLevel } from '../../../packages/shared/types'

export interface Restaurant {
  id: string
  name: string
  address: string
  city: string
  level: RestaurantLevel
  hechsherId: string
  mashgiachId?: string
  kitniyot: 'ללא חשש קטניות' | 'מכיל קטניות'
  foodType?: FoodType
  expires: string
  status: CertStatus
  rabbanutId: string
  notes?: string
  lastInspection?: string
}
