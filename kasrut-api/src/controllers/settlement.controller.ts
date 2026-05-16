import { settlementsRepo } from '../db/settlements.repo'
import type { LangHint }  from '../db/settlements.repo'
import { withCache }       from '../lib/cache'
import { asyncHandler }    from '../lib/asyncHandler'

const CACHE_TTL = 600 // 10 min

function parseLang(raw: unknown): LangHint {
  if (raw === 'ru' || raw === 'en') return raw
  return 'he'
}

export const settlementController = {
  // GET /api/settlements/search?q=Иерус&lang=ru&country=IL
  search: asyncHandler(async (req, res) => {
    const q       = String(req.query.q       ?? '').trim()
    const lang    = parseLang(req.query.lang)
    const country = String(req.query.country ?? 'IL').toUpperCase().slice(0, 2)

    if (q.length < 2) { res.json([]); return }

    // Cache key includes lang so "Ир" (ru) and "יר" (he) get separate caches
    const key  = `settlements:search:${country}:${lang}:${q.toLowerCase()}`
    const data = await withCache(key, CACHE_TTL,
      () => settlementsRepo.searchWithFallback(q, lang, country),
    )
    res.json(data)
  }),
}
