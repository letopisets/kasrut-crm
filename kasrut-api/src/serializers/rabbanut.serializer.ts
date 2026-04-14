import type { Rabbanut } from '../models/types'

export const serializeRabbanut = (r: Rabbanut) => ({
  id:      r.id,
  name:    r.name,
  city:    r.city,
  contact: r.contact,
  phone:   r.phone,
  email:   r.email,
  active:  r.active,
  color:   r.color,
})

export const serializeRabbanuts = (rs: Rabbanut[]) => rs.map(serializeRabbanut)
