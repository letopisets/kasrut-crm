import type { Hechsher } from '../models/types'

export const serializeHechsher = (h: Hechsher) => ({
  id:         h.id,
  name:       h.name,
  shortName:  h.shortName,
  city:       h.city,
  contact:    h.contact,
  phone:      h.phone,
  email:      h.email,
  type:       h.type,
  color:      h.color,
  rabbanutId: h.rabbanutId,
})

export const serializeHechsherim = (hs: Hechsher[]) => hs.map(serializeHechsher)
