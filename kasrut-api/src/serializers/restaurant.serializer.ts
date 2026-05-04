import type { Restaurant } from '../models/types'

export const serializeRestaurant = (r: Restaurant) => ({
  id:             r.id,
  name:           r.name,
  address:        r.address,
  city:           r.city,
  level:          r.level,
  hechsherId:     r.hechsherId,
  mashgiachId:    r.mashgiachId ?? null,
  kitniyot:       r.kitniyot,
  foodType:       r.foodType ?? null,
  expires:        r.expires,
  status:         r.status,
  rabbanutId:     r.rabbanutId,
  notes:          r.notes ?? null,
  lastInspection: r.lastInspection ?? null,
})

export const serializeRestaurants = (rs: Restaurant[]) => rs.map(serializeRestaurant)
