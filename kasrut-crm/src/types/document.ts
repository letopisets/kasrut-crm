export type { DocumentCategory, DocExt } from '../../../packages/shared/types'
import type { DocumentCategory, DocExt } from '../../../packages/shared/types'

export interface KashrutDocument {
  id: string
  name: string
  category: DocumentCategory
  date: string
  size: string
  ext: DocExt
  url?: string | null
  /** null / absent = global document (owner-managed, visible to every role). */
  rabbanutId?: string | null
}

/** POST /documents body. The server pins rabbanut users to their own tenant;
 *  only the owner sends `rabbanutId` (null = global). */
export interface CreateDocumentInput {
  name: string
  category: DocumentCategory
  date: string
  ext: DocExt
  url?: string
  rabbanutId?: string | null
}
