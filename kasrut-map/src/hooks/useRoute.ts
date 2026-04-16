import { useState, useCallback } from 'react'
import type { RouteData, RouteStep } from '@/types'

const OSRM = 'https://router.project-osrm.org/route/v1/foot'

interface OsrmManeuver { type: string; modifier?: string }
interface OsrmStep {
  name:     string
  distance: number
  duration: number
  maneuver: OsrmManeuver
}
interface OsrmLeg   { steps: OsrmStep[] }
interface OsrmRoute {
  distance: number
  duration: number
  geometry: { coordinates: [number, number][] }
  legs:     OsrmLeg[]
}

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

export function formatDist(m: number): string {
  return m >= 1000 ? `${(m / 1000).toFixed(1)} км` : `${Math.round(m)} м`
}
export function formatTime(s: number): string {
  const min = Math.round(s / 60)
  return min < 60 ? `${min} мин` : `${Math.floor(min / 60)} ч ${min % 60} мин`
}

export function useRoute() {
  const [route,   setRoute]   = useState<RouteData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const fetchRoute = useCallback(async (from: [number, number], to: [number, number]) => {
    setLoading(true)
    setError(null)
    try {
      const url = `${OSRM}/${from[1]},${from[0]};${to[1]},${to[0]}?steps=true&overview=full&geometries=geojson`
      const res  = await fetch(url)
      const json = await res.json() as { code: string; routes: OsrmRoute[] }

      if (json.code !== 'Ok') throw new Error('Маршрут не найден')

      const r = json.routes[0]
      const steps: RouteStep[] = r.legs[0].steps.map(s => ({
        instruction: buildInstruction(s),
        distance:    s.distance,
        duration:    s.duration,
      }))
      const geometry: [number, number][] = r.geometry.coordinates.map(([lng, lat]) => [lat, lng])

      setRoute({ geometry, steps, totalDistance: r.distance, totalDuration: r.duration })
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка маршрута')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearRoute = useCallback(() => { setRoute(null); setError(null) }, [])

  return { route, loading, error, fetchRoute, clearRoute, formatDist, formatTime }
}
