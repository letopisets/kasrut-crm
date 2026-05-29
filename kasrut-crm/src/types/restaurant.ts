export type { CertStatus, FoodType, KashrutLevel, EstablishmentCategory } from '../../../packages/shared/types'
import type { CertStatus, FoodType } from '../../../packages/shared/types'

export interface Restaurant {
  id: string
  name: string
  address: string
  city: string
  levelId: string
  level: string       // KashrutLevel.name — for display
  hechsherId: string
  mashgiachId?: string
  kitniyot: boolean
  foodType?: FoodType
  expires: string
  status: CertStatus
  rabbanutId: string
  notes?: string
  categoryId?: string
  lastInspection?: string
  settlementId?: string
  createdAt?: string
}
