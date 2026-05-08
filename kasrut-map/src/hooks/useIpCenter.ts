import { useState, useEffect } from 'react'
import { DEFAULT_CENTER } from '@/lib/constants'

const STORAGE_KEY = 'km_ip_center'
const IP_RESOLVE_TIMEOUT_MS = 3_000
const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api'

export interface IpCenter {
  /** Best-known centre — cached IP, fresh IP, or DEFAULT_CENTER until anything resolves. */
  value: [number, number]
  /** True once we either resolved (or attempted to resolve) the IP centre.
   *  Consumers that fire heavy network requests off this position should wait
   *  for `ready` so the very first map open does not hit the API twice. */
  ready: boolean
}

function loadCached(): [number, number] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === 2) return parsed as [number, number]
  } catch { /* ignore */ }
  return null
}

interface GeoResponse { lat?: number; lng?: number; latitude?: number; longitude?: number }

async function fetchOurGeo(signal: AbortSignal): Promise<[number, number] | null> {
  try {
    const r = await fetch(`${API_URL}/map/geo`, { signal })
    if (r.status === 204 || !r.ok) return null
    const data = await r.json() as GeoResponse
    if (typeof data.lat === 'number' && typeof data.lng === 'number') return [data.lat, data.lng]
  } catch { /* fall through to ipapi */ }
  return null
}

async function fetchIpapi(signal: AbortSignal): Promise<[number, number] | null> {
  try {
    const r = await fetch('https://ipapi.co/json/', { signal })
    if (!r.ok) return null
    const data = await r.json() as GeoResponse
    if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
      return [data.latitude, data.longitude]
    }
  } catch { /* network error, blocked, or timeout */ }
  return null
}

// Returns the user's approximate centre derived from IP geolocation.
// - `value` falls back to a cached value (last visit) and finally to DEFAULT_CENTER.
// - `ready` is true after the IP lookup settles (success, failure, or timeout) OR
//   immediately if we already had a cached value — so consumers do not double-fire
//   network requests on cold load.
//
// Resolution order: our own /map/geo (CDN-provided, no third party) → ipapi.co.
// Each lookup shares the same 3s timeout budget; whichever resolves first wins.
export function useIpCenter(): IpCenter {
  const cached = loadCached()
  const [value, setValue] = useState<[number, number]>(cached ?? DEFAULT_CENTER)
  const [ready, setReady] = useState<boolean>(cached !== null)

  useEffect(() => {
    if (cached) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), IP_RESOLVE_TIMEOUT_MS)

    ;(async () => {
      const ours = await fetchOurGeo(controller.signal)
      const coords = ours ?? await fetchIpapi(controller.signal)
      if (coords) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
        setValue(coords)
      }
    })().finally(() => {
      window.clearTimeout(timeout)
      setReady(true)
    })

    return () => {
      window.clearTimeout(timeout)
      controller.abort()
    }
    // `cached` is captured at first render — re-evaluating would defeat the cache.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return { value, ready }
}
