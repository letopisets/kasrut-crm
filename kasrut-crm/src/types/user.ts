export type { Role } from '../../../packages/shared/types'
import type { Role } from '../../../packages/shared/types'

export interface User {
  id: string
  name: string
  role: Role
  rabbanutId?: string   // только для rabbanut и mashgiach
  mashgiachId?: string
  email: string
  twoFactorEnabled: boolean
}
