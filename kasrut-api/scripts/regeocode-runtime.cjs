// Runtime re-geocoder for the PROD api container (no ts-node/node_modules on the
// host). Mirrors scripts/regeocode.ts but requires the already-COMPILED modules
// from dist, so it runs with plain `node` inside the running api container:
//
//   docker cp kasrut-api/scripts/regeocode-runtime.cjs <api-container>:/app/kasrut-api/regeocode-runtime.cjs
//   docker compose ... exec -T -e RG_LIMIT=40 api node regeocode-runtime.cjs
//
// It must be run from the container WORKDIR (/app/kasrut-api) so the ./dist
// requires resolve. Env: RG_LIMIT (rows this run, default 2000),
// RG_RETRY_DAYS (skip rows attempted within N days, default 30; 0 = all),
// RG_INCLUDE_EXACT=1 (also re-check rows already 'exact' — see below). GovMap
// is used automatically for Israeli addresses when the container has
// GOVMAP_API_KEY (dist/lib/nominatim.js loads dist/lib/govmap.js + proj4, so
// the image must be built from a release that includes them). Street-level
// hits (street midpoints) move the pin but stay 'approximate'. A row whose
// GovMap lookup failed transiently (outage, 429, timeout) keeps its coordinates
// and accuracy, so a later run retries it instead of settling for a fallback —
// and LocationIQ/Nominatim are not asked for it (deferOnGovmapTransient). A row
// the fallbacks could not answer (429, 5xx, timeout) is deferred the same way.
// A deferred row is stamped as if attempted just under the retry window ago
// (deferredGeocodeStamp): the next day's run retries it after the
// never-attempted rows, so rows stuck on a lasting failure can't starve new
// ones. A GovMap 401/403 (token/Origin rejected, CDN block) would defer every
// Israeli row: the run stops at once with ABORTED and exit code 1. A
// LocationIQ/Nominatim 401/403 counts as "no match" (logged once).
// With RG_INCLUDE_EXACT=1 an 'exact' row is only re-pinned when GovMap now
// gives an address-level point; it is never downgraded to a street midpoint or
// a LocationIQ/Nominatim result (which are not even asked for it: govmapOnly).
const B = './dist/kasrut-api/src'
const { prisma }           = require(B + '/lib/prisma.js')
const { geocodeAddressDetailed, isAddressLevel, deferredGeocodeStamp } = require(B + '/lib/nominatim.js')
const { govmapAuthRejected } = require(B + '/lib/govmap.js')
const { isWithinIsrael, isInMediterraneanSea, looksLikeIsraeliAddress } = require(B + '/lib/geoValidation.js')
const { invalidateMapCache } = require(B + '/lib/mapCache.js')

function envInt(name, fallback, min) {
  const v = parseInt(process.env[name] || '', 10)
  return Number.isFinite(v) && v >= min ? v : fallback
}

async function main() {
  const limit        = envInt('RG_LIMIT', 2000, 1)
  const retryDays    = envInt('RG_RETRY_DAYS', 30, 0)
  const includeExact = process.env.RG_INCLUDE_EXACT === '1'
  const cutoff       = new Date(Date.now() - retryDays * 86400000)

  const rows = await prisma.restaurant.findMany({
    where: {
      deletedAt: null,
      geoAccuracy: includeExact ? { in: ['approximate', 'exact'] } : 'approximate',
      address: { not: '' },
      OR: [{ geocodeAttemptedAt: null }, { geocodeAttemptedAt: { lt: cutoff } }],
    },
    orderBy: { geocodeAttemptedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true, name: true, address: true, city: true, lat: true, lng: true, geoAccuracy: true },
  })
  console.log('processing ' + rows.length + ' rows' + (includeExact ? ' (approximate + exact)' : '') + ', retry_days=' + retryDays)

  let up = 0, sk = 0, st = 0, df = 0, dff = 0, ex = 0, exKept = 0, i = 0
  let aborted = false
  const byProvider = {}
  const defer = r => prisma.restaurant.update({
    where: { id: r.id }, data: { geocodeAttemptedAt: deferredGeocodeStamp(new Date(), retryDays) },
  })
  const progress = () => {
    if (i % 50 === 0) console.log('... ' + i + '/' + rows.length + ' exact=' + up + ' street=' + st + ' skip=' + sk + ' deferred=' + (df + dff) + (includeExact ? ' exact_repinned=' + ex : ''))
  }
  for (const r of rows) {
    i++
    // Region routing, mirroring the map SPA: Israeli-looking addresses are
    // IL-restricted; anything else is a worldwide search.
    const israeli = looksLikeIsraeliAddress(r.address, r.city)
    let p = null
    let govmapTransient = false
    let fallbackTransient = false
    try {
      // An 'exact' row only ever takes GovMap's own point, so skip the fallbacks.
      const o = await geocodeAddressDetailed(r.address, r.city, israeli ? 'IL' : undefined,
        { deferOnGovmapTransient: true, govmapOnly: r.geoAccuracy === 'exact' })
      p = o.point
      govmapTransient = o.govmapTransient
      fallbackTransient = o.fallbackTransient
    } catch (e) { fallbackTransient = true /* unexpected error: retry next run */ }
    if (govmapTransient && !(p && p.provider === 'govmap')) {
      if (govmapAuthRejected()) {
        // Not an outage: every Israeli row would be deferred the same way.
        console.error('ABORTED: GovMap rejected the request (HTTP 401/403: token revoked/expired, GOVMAP_ORIGIN not approved, or a CDN block). Fix GOVMAP_API_KEY / GOVMAP_ORIGIN and re-run; this row and the rest of the batch were left untouched.')
        aborted = true
        break
      }
      df++; await defer(r); progress(); continue
    }
    if (!p && fallbackTransient) { dff++; await defer(r); progress(); continue }
    const now = new Date()
    const plausible = p !== null
      && (!israeli || isWithinIsrael(p))
      && !(isWithinIsrael(p) && isInMediterraneanSea(p))
    if (r.geoAccuracy === 'exact') {
      // RG_INCLUDE_EXACT: only GovMap's own address-level point replaces an exact pin.
      if (p && plausible && p.provider === 'govmap' && isAddressLevel(p)) {
        await prisma.restaurant.update({
          where: { id: r.id },
          data: { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), geocodeAttemptedAt: now },
        })
        ex++
      } else {
        await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: now } })
        exKept++
      }
      progress()
      continue
    }
    if (p && plausible) {
      const exact = isAddressLevel(p)
      await prisma.restaurant.update({
        where: { id: r.id },
        data: { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), geoAccuracy: exact ? 'exact' : 'approximate', geocodeAttemptedAt: now },
      })
      const provider = p.provider || 'unknown'
      if (exact) {
        up++
        byProvider[provider] = (byProvider[provider] || 0) + 1
        if (up <= 6) console.log('[' + i + '] OK ' + r.name + ' (' + provider + ') -> ' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5))
      } else {
        st++
      }
    } else {
      await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: now } })
      sk++
    }
    progress()
  }

  if (up + st + ex > 0) { try { await invalidateMapCache() } catch (e) { /* cache best-effort */ } }
  const tally = Object.keys(byProvider).map(k => k + ':' + byProvider[k]).join(',') || 'none'
  console.log((aborted ? 'ABORTED' : 'DONE') + ' processed=' + (aborted ? i - 1 : rows.length) + ' exact=' + up + ' street_level=' + st + ' left_approx=' + sk
    + ' deferred_govmap_unavailable=' + df + ' deferred_fallback_unavailable=' + dff
    + (includeExact ? ' exact_repinned_by_govmap=' + ex + ' exact_kept=' + exKept : '')
    + ' by_provider=' + tally)
  await prisma.$disconnect()
  try { const { redis } = require(B + '/lib/redis.js'); await redis.quit() } catch (e) { /* redis may be down */ }
  if (aborted) process.exitCode = 1
}

main().catch(e => { console.error(e); process.exit(1) })
