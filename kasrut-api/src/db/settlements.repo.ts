import { prisma }            from '../lib/prisma'
import { geocodeSettlement } from '../lib/nominatim'
import type { SettlementType } from '../generated/prisma/client'

export type LangHint = 'he' | 'ru' | 'en'

const KNOWN_TYPES = new Set<string>(['city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter'])

function toSettlementType(raw: string): SettlementType {
  return KNOWN_TYPES.has(raw) ? (raw as SettlementType) : 'other'
}

export interface SettlementRow {
  id:     string
  nameHe: string
  nameEn: string | null
  nameRu: string | null
  lat:    number | null
  lng:    number | null
  type:   string
}

// Map language hint to the DB column name
function langField(lang: LangHint): 'nameHe' | 'nameEn' | 'nameRu' {
  if (lang === 'en') return 'nameEn'
  if (lang === 'ru') return 'nameRu'
  return 'nameHe'
}

function toRow(s: {
  id: string; nameHe: string; nameEn: string | null; nameRu: string | null
  lat: number | null; lng: number | null; type: string
}): SettlementRow {
  return { id: s.id, nameHe: s.nameHe, nameEn: s.nameEn, nameRu: s.nameRu, lat: s.lat, lng: s.lng, type: s.type }
}

export const settlementsRepo = {
  /** Pass 1: startsWith in the requested language column. */
  async search(query: string, lang: LangHint = 'he', countryCode = 'IL'): Promise<SettlementRow[]> {
    const col = langField(lang)
    const rows = await prisma.settlement.findMany({
      where: {
        countryCode: countryCode.toUpperCase(),
        [col]: { startsWith: query, mode: 'insensitive' },
      },
      orderBy: { [col]: 'asc' },
      take: 20,
    })
    return rows.map(toRow)
  },

  /**
   * Pass 1: startsWith across all name columns (OR).
   * Pass 2 (if empty): contains across all three columns.
   * Pass 3 (if still empty): Nominatim geocoder fallback.
   */
  async searchWithFallback(query: string, lang: LangHint = 'he', countryCode = 'IL'): Promise<SettlementRow[]> {
    const cc = countryCode.toUpperCase()

    // Pass 1 — prefix match in any language
    const pass1 = await prisma.settlement.findMany({
      where: {
        countryCode: cc,
        OR: [
          { nameHe: { startsWith: query, mode: 'insensitive' } },
          { nameEn: { startsWith: query, mode: 'insensitive' } },
          { nameRu: { startsWith: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { [langField(lang)]: 'asc' },
      take: 20,
    })
    if (pass1.length) return pass1.map(toRow)

    // Pass 2 — substring match in any language
    const pass2 = await prisma.settlement.findMany({
      where: {
        countryCode: cc,
        OR: [
          { nameHe: { contains: query, mode: 'insensitive' } },
          { nameEn: { contains: query, mode: 'insensitive' } },
          { nameRu: { contains: query, mode: 'insensitive' } },
        ],
      },
      orderBy: { [langField(lang)]: 'asc' },
      take: 20,
    })
    if (pass2.length) return pass2.map(toRow)

    // Pass 3 — Nominatim fallback (rate-limited, cached 24 h)
    const nominatim = await geocodeSettlement(query, countryCode)
    return nominatim.map(n => ({
      id:     String(n.placeId),
      nameHe: n.nameHe ?? n.displayName,
      nameEn: n.nameEn ?? n.displayName,
      nameRu: n.nameRu ?? null,
      lat:    n.lat,
      lng:    n.lng,
      type:   toSettlementType(n.type),
    }))
  },

  async findById(id: string): Promise<SettlementRow | null> {
    const s = await prisma.settlement.findUnique({ where: { id } })
    return s ? toRow(s) : null
  },
}
