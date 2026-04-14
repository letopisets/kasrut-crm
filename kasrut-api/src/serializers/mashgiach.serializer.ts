import type { Mashgiach } from '../models/types'

export const serializeMashgiach = (m: Mashgiach) => ({
  id:                    m.id,
  name:                  m.name,
  phone:                 m.phone,
  email:                 m.email,
  area:                  m.area,
  hechsherimIds:         m.hechsherimIds,
  assignedRestaurantIds: m.assignedRestaurantIds,
  active:                m.active,
  rabbanutId:            m.rabbanutId,
})

export const serializeMashgichim = (ms: Mashgiach[]) => ms.map(serializeMashgiach)
