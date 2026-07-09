import 'dotenv/config'
import { PrismaClient } from '../src/generated/prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'
import { geocodeAddress } from '../src/lib/nominatim'
import { isWithinIsrael } from '../src/lib/geoValidation'
import { invalidateMapCache } from '../src/lib/mapCache'
import { redis } from '../src/lib/redis'

// Background re-geocoder: replaces the import's approximate (city-centre +
// jitter) coordinates with real address-level ones from OSM Nominatim, and
// flips geoAccuracy to 'exact' when it succeeds. Rate-limited to 1 req/sec by
// lib/nominatim, so it's safe to run against the public Nominatim in small
// batches (cron-friendly).
//
// Usage:  ts-node scripts/regeocode.ts [--limit N] [--retry-days D]
//   --limit       max rows to process this run (default 25)
//   --retry-days  re-attempt a previously-failed row only after D days (default 30)

function arg(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return fallback
  const v = Number(process.argv[i + 1])
  return Number.isFinite(v) && v > 0 ? v : fallback
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is missing')

  const limit     = Math.floor(arg('limit', 25))
  const retryDays = arg('retry-days', 30)
  const cutoff    = new Date(Date.now() - retryDays * 86_400_000)

  const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL })
  const prisma  = new PrismaClient({ adapter })

  let upgraded = 0, attempted = 0, skipped = 0

  try {
    const rows = await prisma.restaurant.findMany({
      where: {
        deletedAt: null,
        geoAccuracy: 'approximate',
        address: { not: '' },
        OR: [
          { geocodeAttemptedAt: null },
          { geocodeAttemptedAt: { lt: cutoff } },
        ],
      },
      orderBy: { geocodeAttemptedAt: { sort: 'asc', nulls: 'first' } },
      take: limit,
      select: { id: true, name: true, address: true, city: true },
    })

    console.log(`Re-geocoding ${rows.length} approximate establishment(s) (limit ${limit})...`)

    for (const r of rows) {
      attempted++
      const point = await geocodeAddress(r.address, r.city)
      const now = new Date()

      if (point && isWithinIsrael({ lat: point.lat, lng: point.lng })) {
        await prisma.restaurant.update({
          where: { id: r.id },
          data: {
            lat: Number(point.lat.toFixed(6)),
            lng: Number(point.lng.toFixed(6)),
            geoAccuracy: 'exact',
            geocodeAttemptedAt: now,
          },
        })
        upgraded++
        console.log(`  ✓ ${r.name} — ${point.addresstype} @ ${point.lat.toFixed(5)},${point.lng.toFixed(5)}`)
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
    if (upgraded > 0) await invalidateMapCache().catch(() => { /* cache best-effort */ })

    console.log(`Done. Attempted ${attempted}, upgraded ${upgraded} to exact, ${skipped} left approximate.`)
  } finally {
    await prisma.$disconnect()
    await redis.quit().catch(() => { /* redis may be down */ })
  }
}

main().catch(err => {
  console.error(err)
  process.exitCode = 1
})
