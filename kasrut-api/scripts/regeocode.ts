import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { geocodeAddressDetailed, isAddressLevel, deferredGeocodeStamp } from '../src/lib/nominatim'
import { govmapAuthRejected } from '../src/lib/govmap'
import { isWithinIsrael, isInMediterraneanSea, looksLikeIsraeliAddress } from '../src/lib/geoValidation'
import { invalidateMapCache } from '../src/lib/mapCache'
import { redis } from '../src/lib/redis'

// Background re-geocoder: replaces the import's approximate (city-centre +
// jitter) coordinates with real address-level ones and flips geoAccuracy to
// 'exact' when it succeeds. A street-level hit (a street midpoint, e.g. for an
// address without a house number) moves the pin but stays 'approximate', so
// the prerender never publishes it as the place's exact geo. lib/nominatim.geocodeAddress picks the provider:
// GovMap first for Israeli addresses (when GOVMAP_API_KEY is set), then
// LocationIQ, then OSM Nominatim (rate-limited to 1 req/sec), so it's safe to
// run in small batches (cron-friendly). When GovMap fails transiently (outage,
// 429, timeout) a row is deferred: its coordinates and accuracy are kept for a
// later run, rather than settling for a fallback point and being skipped for
// --retry-days — and the fallbacks are not asked at all
// (deferOnGovmapTransient), so no LocationIQ/Nominatim quota is spent on an
// answer we'd discard. Likewise when the fallbacks themselves fail transiently
// (429, 5xx, timeout) and nothing was found. A deferred row is not re-queued
// first, though: it is stamped as if attempted just under the retry window ago
// (deferredGeocodeStamp), so the next day's run retries it after the
// never-attempted rows — rows stuck on a lasting failure can't fill every
// batch and starve new ones. A GovMap 401/403 (token /
// Origin rejected, CDN block) is a config error that would defer every Israeli
// row, so the run stops at once with an error and a non-zero exit code; a
// LocationIQ/Nominatim 401/403 counts as "no match" (logged once).
//
// Usage:  ts-node scripts/regeocode.ts [--limit N] [--retry-days D] [--include-exact]
//   --limit          max rows to process this run (default 25)
//   --retry-days     re-attempt a previously-attempted row only after D days
//                    (default 30; 0 = every row now, for a full pass)
//   --include-exact  also re-check rows already marked 'exact' (or set
//                    RG_INCLUDE_EXACT=1) — a one-off full pass after a geocoder
//                    change. Such a row is only moved when GovMap now gives an
//                    address-level point; it is never downgraded to a street
//                    midpoint or a LocationIQ/Nominatim result (which are not
//                    even asked for it: govmapOnly).

function arg(name: string, fallback: number, min = 1): number {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) && v >= min ? v : fallback
}

function metersApart(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const dLat = (a.lat - b.lat) * 111_320
  const dLng = (a.lng - b.lng) * 111_320 * Math.cos((a.lat * Math.PI) / 180)
  return Math.hypot(dLat, dLng)
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

  const limit        = Math.floor(arg('limit', 25))
  const retryDays    = arg('retry-days', 30, 0)
  const includeExact = process.argv.includes('--include-exact') || process.env.RG_INCLUDE_EXACT === '1'
  const cutoff       = new Date(Date.now() - retryDays * 86_400_000)

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma  = new PrismaClient({ adapter })

  let upgraded = 0, attempted = 0, skipped = 0, streetLevel = 0, deferred = 0, deferredFallback = 0
  let exactMoved = 0, exactKept = 0
  let aborted = false
  const byProvider: Record<string, number> = {}

  try {
    const rows = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        geoAccuracy: includeExact ? { in: ['approximate', 'exact'] } : 'approximate',
        address: { not: '' },
        OR: [
          { geocodeAttemptedAt: null },
          { geocodeAttemptedAt: { lt: cutoff } },
        ],
      },
      orderBy: { geocodeAttemptedAt: { sort: 'asc', nulls: 'first' } },
      take: limit,
      select: { id: true, name: true, address: true, city: true, lat: true, lng: true, geoAccuracy: true },
    })

    console.log(`Re-geocoding ${rows.length} ${includeExact ? 'approximate + exact' : 'approximate'} establishment(s) (limit ${limit}, retry after ${retryDays} d)...`)

    for (const r of rows) {
      attempted++
      // Region routing, mirroring the map SPA: Israeli-looking addresses are
      // IL-restricted (and must land inside Israel, on land); anything else is
      // a worldwide search (the city in the query disambiguates).
      const israeli = looksLikeIsraeliAddress(r.address, r.city)
      // An 'exact' row only ever takes GovMap's own point (below), so the
      // fallbacks are not asked for it.
      const { point, govmapTransient, fallbackTransient } = await geocodeAddressDetailed(
        r.address, r.city, israeli ? 'IL' : undefined,
        { deferOnGovmapTransient: true, govmapOnly: r.geoAccuracy === 'exact' },
      )
      const now = new Date()

      if (govmapTransient && point?.provider !== 'govmap') {
        if (govmapAuthRejected()) {
          // Not an outage: every Israeli row would be deferred the same way.
          console.error('ABORTED: GovMap rejected the request (HTTP 401/403: token revoked/expired, GOVMAP_ORIGIN not approved, or a CDN block). Fix GOVMAP_API_KEY / GOVMAP_ORIGIN and re-run; this row and the rest of the batch were left untouched.')
          process.exitCode = 1
          aborted = true
          break
        }
        deferred++
        await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: deferredGeocodeStamp(now, retryDays) } })
        console.log(`  … ${r.name} — GovMap unavailable, retry next run (${r.address}, ${r.city})`)
        continue
      }
      if (!point && fallbackTransient) {
        deferredFallback++
        await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: deferredGeocodeStamp(now, retryDays) } })
        console.log(`  … ${r.name} — LocationIQ/Nominatim unavailable, retry next run (${r.address}, ${r.city})`)
        continue
      }

      const plausible = point !== null
        && (!israeli || isWithinIsrael(point))
        && !(isWithinIsrael(point) && isInMediterraneanSea(point))

      if (r.geoAccuracy === 'exact') {
        // --include-exact: only GovMap's own address-level point replaces an
        // exact pin (it fixes wrong-city 'exact' rows, and street-midpoint ones
        // whose address has a house number — not those without one, see
        // docs/deployment/hetzner.md); anything weaker leaves the row as it is.
        if (point && plausible && point.provider === 'govmap' && isAddressLevel(point)) {
          const lat = Number(point.lat.toFixed(6))
          const lng = Number(point.lng.toFixed(6))
          await prisma.restaurant.update({ where: { id: r.id }, data: { lat, lng, geocodeAttemptedAt: now } })
          exactMoved++
          const d = r.lat !== null && r.lng !== null ? Math.round(metersApart({ lat: r.lat, lng: r.lng }, { lat, lng })) : null
          if (d === null || d > 25) console.log(`  ↻ ${r.name} — exact pin moved ${d ?? '?'} m to GovMap ${point.addresstype} (${r.address}, ${r.city})`)
        } else {
          await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: now } })
          exactKept++
        }
        continue
      }

      if (point && plausible) {
        const exact = isAddressLevel(point)
        await prisma.restaurant.update({
          where: { id: r.id },
          data: {
            lat: Number(point.lat.toFixed(6)),
            lng: Number(point.lng.toFixed(6)),
            geoAccuracy: exact ? 'exact' : 'approximate',
            geocodeAttemptedAt: now,
          },
        })
        const provider = point.provider ?? 'unknown'
        if (exact) {
          upgraded++
          byProvider[provider] = (byProvider[provider] ?? 0) + 1
        } else {
          streetLevel++
        }
        console.log(`  ${exact ? '✓' : '~'} ${r.name} — ${provider} ${point.addresstype} @ ${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
      } else {
        // Record the attempt so we don't retry an un-geocodable address every run.
        await prisma.restaurant.update({
          where: { id: r.id },
          data: { geocodeAttemptedAt: now },
        })
        skipped++
        console.log(`  · ${r.name} — no precise match (${r.address}, ${r.city})`)
      }
    }

    // Flush the map response cache so upgraded coordinates show immediately.
    if (upgraded + streetLevel + exactMoved > 0) await invalidateMapCache().catch(() => { /* cache best-effort */ })

    const tally = Object.entries(byProvider).map(([k, n]) => `${k} ${n}`).join(', ') || 'none'
    console.log(`${aborted ? 'ABORTED' : 'Done'}. Attempted ${attempted}, upgraded ${upgraded} to exact (${tally}), ${streetLevel} moved to street level (still approximate), ${skipped} left approximate, ${deferred} deferred (GovMap unavailable), ${deferredFallback} deferred (fallback unavailable)${includeExact ? `, exact rows: ${exactMoved} re-pinned by GovMap, ${exactKept} kept` : ''}.`)
  } finally {
    await prisma.$disconnect()
    await redis.quit().catch(() => { /* redis may be down */ })
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
