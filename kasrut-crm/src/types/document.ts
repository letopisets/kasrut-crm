export type { DocumentCategory, DocExt } from '../../../packages/shared/types'
import type { DocumentCategory, DocExt } from '../../../packages/shared/types'

export interface KashrutDocument {
  id: string
  name: string
  category: DocumentCategory
  date: string
  size: string
  ext: DocExt
  url?: string
}
