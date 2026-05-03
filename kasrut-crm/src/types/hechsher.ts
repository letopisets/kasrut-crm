export type { HechsherType } from '../../../packages/shared/types'
import type { HechsherType } from '../../../packages/shared/types'

export interface Hechsher {
  id: string
  name: string
  shortName: string
  city?: string
  contact?: string
  phone?: string
  email?: string
  type: HechsherType
  color: string
  rabbanutId: string
}