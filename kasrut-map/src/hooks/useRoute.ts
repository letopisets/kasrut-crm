import { useState, useCallback, useEffect, useRef } from 'react'
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
  const abortRef = useRef<AbortController | null>(null)
  const requestIdRef = useRef(0)

  useEffect(() => () => {
    abortRef.current?.abort()
  }, [])

  const fetchRoute = useCallback(async (from: [number, number], to: [number, number]) => {
    abortRef.current?.abort()
    const controller = new AbortController()
    const requestId = requestIdRef.current + 1
    requestIdRef.current = requestId
    abortRef.current = controller

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
      const res = await fetch(`${API_BASE_URL}/map/route?${params.toString()}`, {
        signal: controller.signal,
      })
      const json = await res.json().catch(() => null) as (RouteData & { error?: string }) | null

      if (!res.ok || !json) {
        throw new Error(json?.error || 'Не удалось построить маршрут')
      }

      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setRoute(json)
    } catch (e) {
      if (controller.signal.aborted || requestId !== requestIdRef.current) return
      setError(e instanceof Error ? e.message : 'Ошибка маршрута')
    } finally {
      if (!controller.signal.aborted && requestId === requestIdRef.current) {
        setLoading(false)
        abortRef.current = null
      }
    }
  }, [])

  const clearRoute = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    requestIdRef.current += 1
    setLoading(false)
    setRoute(null)
    setError(null)
  }, [])

  return { route, loading, error, fetchRoute, clearRoute, formatDist, formatTime }
}
