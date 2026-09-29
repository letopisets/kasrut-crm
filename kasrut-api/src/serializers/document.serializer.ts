import type { KashrutDocument } from '../models/types'
import { isHttpsUrl } from '../lib/httpsUrl'

export const serializeDocument = (d: KashrutDocument) => ({
  id:         d.id,
  name:       d.name,
  category:   d.category,
  date:       d.date,
  size:       d.size,
  ext:        d.ext,
  // Only https links leave the API. Rows written around the create schema
  // (the PDF importer stored the operator's local file path) read as no link.
  url:        d.url && isHttpsUrl(d.url) ? d.url : null,
  rabbanutId: d.rabbanutId ?? null,   // null = global document
})

export const serializeDocuments = (ds: KashrutDocument[]) => ds.map(serializeDocument)
