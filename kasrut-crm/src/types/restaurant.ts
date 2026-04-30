export type CertStatus = 'ok' | 'warning' | 'critical'

export interface Restaurant {
  id: string
  name: string
  address: string
  city: string
  level: 'Regular' | 'Mehadrin'
  hechsherId: string
  mashgiachId?: string
  kitniyot: 'ללא חשש קטניות' | 'מכיל קטניות'
  expires: string       // ISO дата
  status: CertStatus
  rabbanutId: string
  notes?: string
  lastInspection?: string
}
