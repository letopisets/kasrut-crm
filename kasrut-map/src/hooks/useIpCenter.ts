import { useState, useEffect } from 'react'
import { DEFAULT_CENTER } from '@/lib/constants'

const STORAGE_KEY = 'km_ip_center'
const IP_RESOLVE_TIMEOUT_MS = 3_000

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

// Returns the user's approximate centre derived from IP geolocation.
// - `value` falls back to a cached value (last visit) and finally to DEFAULT_CENTER.
// - `ready` is true after the IP lookup settles (success, failure, or timeout) OR
//   immediately if we already had a cached value — so consumers do not double-fire
//   network requests on cold load.
export function useIpCenter(): IpCenter {
  const cached = loadCached()
  const [value, setValue] = useState<[number, number]>(cached ?? DEFAULT_CENTER)
  // If we have a cached value we treat it as good enough to start fetching with;
  // a fresh IP lookup may refine it but won't change the order of magnitude.
  const [ready, setReady] = useState<boolean>(cached !== null)

  useEffect(() => {
    if (cached) return

    const controller = new AbortController()
    const timeout = window.setTimeout(() => controller.abort(), IP_RESOLVE_TIMEOUT_MS)

    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then(r => r.json())
      .then((data: { latitude?: number; longitude?: number }) => {
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          const coords: [number, number] = [data.latitude, data.longitude]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
          setValue(coords)
        }
      })
      .catch(() => { /* network error, blocked, or timeout — keep DEFAULT_CENTER */ })
      .finally(() => {
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
