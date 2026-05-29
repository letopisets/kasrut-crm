import { prisma } from '../lib/prisma'
import type { EstablishmentCategory } from '../models/types'

export const establishmentCategoriesRepo = {
  async findAll(): Promise<EstablishmentCategory[]> {
    const rows = await prisma.establishmentCategory.findMany({ orderBy: { nameHe: 'asc' } })
    return rows.map(r => ({
      id:     r.id,
      slug:   r.slug,
      nameHe: r.nameHe,
      nameEn: r.nameEn ?? undefined,
      nameRu: r.nameRu ?? undefined,
    }))
  },
}
