import type { KashrutDocument } from '../models/types'

export const serializeDocument = (d: KashrutDocument) => ({
  id:       d.id,
  name:     d.name,
  category: d.category,
  date:     d.date,
  size:     d.size,
  ext:      d.ext,
  url:      d.url ?? null,
})

export const serializeDocuments = (ds: KashrutDocument[]) => ds.map(serializeDocument)
