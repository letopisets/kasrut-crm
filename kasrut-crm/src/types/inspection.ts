export type { InspectionResult, InspectionType } from '../../../packages/shared/types'
import type { InspectionResult, InspectionType } from '../../../packages/shared/types'

export interface Inspection {
  id: string
  restaurantId: string
  mashgiachId?: string
  date: string
  type: InspectionType
  result: InspectionResult
  notes?: string
}
