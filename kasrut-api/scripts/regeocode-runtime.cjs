// Runtime re-geocoder for the PROD api container (no ts-node/node_modules on the
// host). Mirrors scripts/regeocode.ts but requires the already-COMPILED modules
// from dist, so it runs with plain `node` inside the running api container:
//
//   docker cp kasrut-api/scripts/regeocode-runtime.cjs <api-container>:/app/kasrut-api/regeocode-runtime.cjs
//   docker compose ... exec -T -e RG_LIMIT=40 api node regeocode-runtime.cjs
//
// It must be run from the container WORKDIR (/app/kasrut-api) so the ./dist
// requires resolve. Env: RG_LIMIT (rows this run, default 2000),
// RG_RETRY_DAYS (skip rows attempted within N days, default 30).
const B = './dist/kasrut-api/src'
const { prisma }           = require(B + '/lib/prisma.js')
const { geocodeAddress }   = require(B + '/lib/nominatim.js')
const { isWithinIsrael }   = require(B + '/lib/geoValidation.js')
const { invalidateMapCache } = require(B + '/lib/mapCache.js')

async function main() {
  const limit     = parseInt(process.env.RG_LIMIT || '2000', 10)
  const retryDays = parseInt(process.env.RG_RETRY_DAYS || '30', 10)
  const cutoff    = new Date(Date.now() - retryDays * 86400000)

  const rows = await prisma.restaurant.findMany({
    where: {
      deletedAt: null, geoAccuracy: 'approximate', address: { not: '' },
      OR: [{ geocodeAttemptedAt: null }, { geocodeAttemptedAt: { lt: cutoff } }],
    },
    orderBy: { geocodeAttemptedAt: { sort: 'asc', nulls: 'first' } },
    take: limit,
    select: { id: true, name: true, address: true, city: true },
  })
  console.log('processing ' + rows.length + ' rows')

  let up = 0, sk = 0, i = 0
  for (const r of rows) {
    i++
    let p = null
    try { p = await geocodeAddress(r.address, r.city) } catch (e) { /* treat as no result */ }
    const now = new Date()
    if (p && isWithinIsrael({ lat: p.lat, lng: p.lng })) {
      await prisma.restaurant.update({
        where: { id: r.id },
        data: { lat: Number(p.lat.toFixed(6)), lng: Number(p.lng.toFixed(6)), geoAccuracy: 'exact', geocodeAttemptedAt: now },
      })
      up++
      if (up <= 6) console.log('[' + i + '] OK ' + r.name + ' -> ' + p.lat.toFixed(5) + ',' + p.lng.toFixed(5))
    } else {
      await prisma.restaurant.update({ where: { id: r.id }, data: { geocodeAttemptedAt: now } })
      sk++
    }
    if (i % 50 === 0) console.log('... ' + i + '/' + rows.length + ' exact=' + up + ' skip=' + sk)
  }

  if (up > 0) { try { await invalidateMapCache() } catch (e) { /* cache best-effort */ } }
  console.log('DONE processed=' + rows.length + ' exact=' + up + ' left_approx=' + sk)
  await prisma.$disconnect()
  try { const { redis } = require(B + '/lib/redis.js'); await redis.quit() } catch (e) { /* redis may be down */ }
}

main().catch(e => { console.error(e); process.exit(1) })
