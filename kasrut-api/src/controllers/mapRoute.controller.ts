import { z } from 'zod'
import { withCache } from '../lib/cache'
import { asyncHandler } from '../lib/asyncHandler'

const ROUTE_CACHE_TTL = 60 * 60
const OSRM_BASE_URL = (process.env.OSRM_BASE_URL ?? 'https://router.project-osrm.org/route/v1').replace(/\/$/, '')
const ROUTE_TIMEOUT_MS = 8_000

const routeQuerySchema = z.object({
  fromLat: z.coerce.number().min(-90).max(90),
  fromLng: z.coerce.number().min(-180).max(180),
  toLat:   z.coerce.number().min(-90).max(90),
  toLng:   z.coerce.number().min(-180).max(180),
})

interface OsrmManeuver { type: string; modifier?: string }
interface OsrmStep { name: string; distance: number; duration: number; maneuver: OsrmManeuver }
interface OsrmLeg { steps: OsrmStep[] }
interface OsrmRoute { distance: number; duration: number; geometry: { coordinates: [number, number][] }; legs: OsrmLeg[] }
interface OsrmResponse { code: string; message?: string; routes?: OsrmRoute[] }

function buildInstruction({ maneuver: { type, modifier }, name }: OsrmStep): string {
  const street = name ? ` по ${name}` : ''
  if (type === 'depart') return `Начните движение${street}`
  if (type === 'arrive') return 'Вы прибыли к цели'
  if (type === 'turn') {
    const dir = modifier === 'left' ? 'налево' : modifier === 'right' ? 'направо' : 'прямо'
    return `Поверните ${dir}${street}`
  }
  if (type === 'roundabout' || type === 'rotary') return `Въедьте на круговое движение${street}`
  return `Продолжайте движение${street}`
}

export const mapRouteController = {
  getRoute: asyncHandler(async (req, res) => {
    const parsed = routeQuerySchema.safeParse(req.query)
    if (!parsed.success) { res.status(400).json({ error: 'Invalid route coordinates' }); return }

    const { fromLat, fromLng, toLat, toLng } = parsed.data
    const r = (v: number) => Math.round(v * 1_000) / 1_000
    const cacheKey = `map:route:foot:${r(fromLat)},${r(fromLng)}=>${r(toLat)},${r(toLng)}`

    try {
      const data = await withCache(cacheKey, ROUTE_CACHE_TTL, async () => {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), ROUTE_TIMEOUT_MS)
        try {
          const coordinates = `${fromLng},${fromLat};${toLng},${toLat}`
          const params = new URLSearchParams({ steps: 'true', overview: 'full', geometries: 'geojson' })
          const url = `${OSRM_BASE_URL}/foot/${coordinates}?${params.toString()}`
          const upstream = await fetch(url, {
            signal: controller.signal,
            headers: { 'User-Agent': 'kasrut-crm/1.0 (+https://mykoshermap.com)' },
          })
          const json = await upstream.json() as OsrmResponse
          if (!upstream.ok) {
            throw Object.assign(new Error(json.message || 'Сервис маршрутов временно недоступен'), { httpStatus: 502 })
          }
          const route = json.routes?.[0]
          if (json.code !== 'Ok' || !route) {
            throw Object.assign(new Error(json.message || 'Маршрут не найден'), { httpStatus: 404 })
          }
          const steps = route.legs[0]?.steps.map(step => ({
            instruction: buildInstruction(step),
            distance: step.distance,
            duration: step.duration,
          })) ?? []
          return {
            geometry: route.geometry.coordinates.map(([lng, lat]) => [lat, lng]),
            steps,
            totalDistance: route.distance,
            totalDuration: route.duration,
          }
        } finally {
          clearTimeout(timeout)
        }
      })
      res.json(data)
    } catch (e) {
      if (e instanceof Error && e.name === 'AbortError') {
        res.status(504).json({ error: 'Сервис маршрутов не ответил вовремя' }); return
      }
      const status = (e as { httpStatus?: number }).httpStatus
      if (status === 404) { res.status(404).json({ error: (e as Error).message }); return }
      res.status(502).json({ error: 'Сервис маршрутов временно недоступен' })
    }
  }),
}
