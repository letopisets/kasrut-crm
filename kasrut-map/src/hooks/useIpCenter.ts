import { useState, useEffect } from 'react'
import { DEFAULT_CENTER } from '@/lib/constants'

const STORAGE_KEY = 'km_ip_center'

function loadCached(): [number, number] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (Array.isArray(parsed) && parsed.length === 2) return parsed as [number, number]
  } catch { /* ignore */ }
  return null
}

// Returns [lat, lng] derived from the user's IP location.
// Falls back to cached value from last visit, then to DEFAULT_CENTER.
// Used only as initial map center — never shown as user position.
export function useIpCenter(): [number, number] {
  const [center, setCenter] = useState<[number, number]>(loadCached() ?? DEFAULT_CENTER)

  useEffect(() => {
    const controller = new AbortController()
    fetch('https://ipapi.co/json/', { signal: controller.signal })
      .then(r => r.json())
      .then((data: { latitude?: number; longitude?: number }) => {
        if (typeof data.latitude === 'number' && typeof data.longitude === 'number') {
          const coords: [number, number] = [data.latitude, data.longitude]
          localStorage.setItem(STORAGE_KEY, JSON.stringify(coords))
          setCenter(coords)
        }
      })
      .catch(() => { /* network error or blocked — keep cached/default */ })
    return () => controller.abort()
  }, [])

  return center
}
