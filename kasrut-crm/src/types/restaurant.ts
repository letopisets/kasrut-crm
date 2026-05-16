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
  kitniyot: boolean
  foodType?: FoodType
  expires: string
  status: CertStatus
  rabbanutId: string
  notes?: string
  lastInspection?: string
  settlementId?: string
  createdAt?: string
}
