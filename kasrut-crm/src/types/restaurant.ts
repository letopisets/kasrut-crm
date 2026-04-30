export type CertStatus = 'ok' | 'warning' | 'critical'
export type FoodType = 'meat' | 'dairy' | 'pareve' | 'takeaway'

export interface Restaurant {
  id: string
  name: string
  address: string
  city: string
  level: 'Regular' | 'Mehadrin'
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
