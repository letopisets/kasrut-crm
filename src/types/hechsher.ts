export type HechsherType = 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'

export interface Hechsher {
  id: string
  name: string
  shortName: string
  city: string
  contact: string
  phone: string
  email: string
  type: HechsherType
  color: string
  rabbanutId: string
}