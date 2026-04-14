import type { Inspection } from '../models/types'

export const serializeInspection = (i: Inspection) => ({
  id:           i.id,
  restaurantId: i.restaurantId,
  mashgiachId:  i.mashgiachId,
  date:         i.date,
  type:         i.type,
  result:       i.result,
  notes:        i.notes ?? null,
})

export const serializeInspections = (is: Inspection[]) => is.map(serializeInspection)
