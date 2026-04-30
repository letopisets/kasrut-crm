import { useState, useCallback } from 'react'
import type { RouteData } from '@/types'

const API_BASE_URL = (import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api').replace(/\/$/, '')

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
    setRoute(null)
    try {
      const params = new URLSearchParams({
        fromLat: String(from[0]),
        fromLng: String(from[1]),
        toLat: String(to[0]),
        toLng: String(to[1]),
      })
      const res = await fetch(`${API_BASE_URL}/map/route?${params.toString()}`)
      const json = await res.json().catch(() => null) as (RouteData & { error?: string }) | null

      if (!res.ok || !json) {
        throw new Error(json?.error || 'Не удалось построить маршрут')
      }

      setRoute(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Ошибка маршрута')
    } finally {
      setLoading(false)
    }
  }, [])

  const clearRoute = useCallback(() => { setRoute(null); setError(null) }, [])

  return { route, loading, error, fetchRoute, clearRoute, formatDist, formatTime }
}
