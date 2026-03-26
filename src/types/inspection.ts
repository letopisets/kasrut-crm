export type InspectionResult = 'pending' | 'open' | 'pass' | 'fail'
export type InspectionType = 'planned' | 'urgent'

export interface Inspection {
  id: string
  restaurantId: string
  mashgiachId: string
  date: string
  type: InspectionType
  result: InspectionResult
  notes?: string
}
