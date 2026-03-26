export interface Hechsher {
  id: string
  name: string
  shortName: string
  city: string
  contact: string
  phone: string
  email: string
  type: 'Rabbanut' | 'Badatz' | 'Mehadrin' | 'Private'
  color: string
  rabbanutId: string
}