import { useState, useEffect, useCallback, useRef } from 'react'

interface GeoState {
  position: [number, number] | null
  accuracy: number | null
  error:    string | null
  loading:  boolean
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:            15_000,
  maximumAge:         0,
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({ position: null, accuracy: null, error: null, loading: true })
  const watchIdRef = useRef<number | null>(null)

  const start = useCallback(() => {
    if (!navigator.geolocation) {
      setState({ position: null, accuracy: null, error: 'Геолокация не поддерживается', loading: false })
      return
    }
    setState(s => ({ ...s, loading: true, error: null }))

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current)
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => setState({
        position: [p.coords.latitude, p.coords.longitude],
        accuracy: p.coords.accuracy,
        error: null,
        loading: false,
      }),
      (e) => setState(s => ({ ...s, error: e.message, loading: false })),
      GEO_OPTIONS,
    )
  }, [])

  useEffect(() => {
    start()
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current)
        watchIdRef.current = null
      }
    }
  }, [start])

  const setPosition = useCallback((pos: [number, number]) => {
    setState({ position: pos, accuracy: null, error: null, loading: false })
  }, [])

  return { ...state, refresh: start, setPosition }
}
