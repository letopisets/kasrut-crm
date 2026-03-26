export type Role = 'owner' | 'rabbanut' | 'mashgiach'

export interface User {
  id: string
  name: string
  role: Role
  rabbanutId?: string   // только для rabbanut и mashgiach
  email: string
}