import { prisma } from '../lib/prisma'
import { Prisma } from '../generated/prisma/client'
import type { KashrutDocument, DocumentCategory, DocExt } from '../models/types'
import type { KashrutDocument as PrismaDoc } from '../generated/prisma/client'

function toDocument(d: PrismaDoc): KashrutDocument {
  return {
    id:       d.id,
    name:     d.name,
    category: d.category as DocumentCategory,
    date:     d.date.toISOString().slice(0, 10),
    size:     Number(d.size),  // BigInt → number for JSON serialisation
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
    const { size, date, ...rest } = input
    // size stored as BigInt in DB; toString() is a compat shim until
    // the Prisma client is regenerated after `prisma migrate dev`.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const d = await prisma.kashrutDocument.create({
      data: { ...rest, date: new Date(date), size: size as any },
    })
    return toDocument(d)
  },

  async remove(id: string): Promise<boolean> {
    try {
      await prisma.kashrutDocument.delete({ where: { id } })
      return true
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return false
      throw e
    }
  },
}
