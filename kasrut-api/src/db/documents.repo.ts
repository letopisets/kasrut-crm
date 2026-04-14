import { prisma } from '../lib/prisma'
import type { KashrutDocument, DocumentCategory, DocExt } from '../models/types'
import type { KashrutDocument as PrismaDoc } from '../generated/prisma/client'

function toDocument(d: PrismaDoc): KashrutDocument {
  return {
    id:       d.id,
    name:     d.name,
    category: d.category as DocumentCategory,
    date:     d.date.toISOString().slice(0, 10),
    size:     d.size,
    ext:      d.ext as DocExt,
    url:      d.url ?? undefined,
  }
}

export const documentsRepo = {
  async findAll(filter?: { category?: string }): Promise<KashrutDocument[]> {
    const rows = await prisma.kashrutDocument.findMany({
      where: filter?.category ? { category: filter.category as DocumentCategory } : undefined,
      orderBy: { date: 'desc' },
    })
    return rows.map(toDocument)
  },

  async findById(id: string): Promise<KashrutDocument | null> {
    const d = await prisma.kashrutDocument.findUnique({ where: { id } })
    return d ? toDocument(d) : null
  },

  async create(input: Omit<KashrutDocument, 'id'>): Promise<KashrutDocument> {
    const d = await prisma.kashrutDocument.create({
      data: { ...input, date: new Date(input.date) },
    })
    return toDocument(d)
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.kashrutDocument.delete({ where: { id } })
      return true
    } catch { return false }
  },
}
