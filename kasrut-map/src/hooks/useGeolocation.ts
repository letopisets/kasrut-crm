import { useState, useEffect, useCallback, useRef } from 'react'

export type GeoErrorCode = 'denied' | 'unavailable' | 'timeout' | 'unsupported'

interface GeoState {
  position:  [number, number] | null
  accuracy:  number | null
  heading:   number | null
  error:     string | null          // raw browser message (diagnostics)
  errorCode: GeoErrorCode | null    // localizable category for the UI
  loading:   boolean
  /** The position was set by hand ("correct my location"); GPS is paused. */
  manual:    boolean
}

// GeolocationPositionError.code → our category
function toErrorCode(code: number): GeoErrorCode {
  if (code === 1) return 'denied'
  if (code === 3) return 'timeout'
  return 'unavailable'
}

const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout:            15_000,
  maximumAge:         30_000,
}

const MIN_POSITION_UPDATE_METERS = 75
const MIN_ACCURACY_IMPROVEMENT_METERS = 50
const NAV_MIN_POSITION_UPDATE_METERS = 3

/** Haversine distance in metres between two [lat,lng] points */
function haversine([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
    * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

/** Initial bearing in degrees (0–360) from point A to point B */
function bearing([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const φ1 = lat1 * Math.PI / 180
  const φ2 = lat2 * Math.PI / 180
  const Δλ = (lng2 - lng1) * Math.PI / 180
  const y = Math.sin(Δλ) * Math.cos(φ2)
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ)
  const θ = Math.atan2(y, x)
  return (θ * 180 / Math.PI + 360) % 360
}

export function useGeolocation() {
  const [state, setState] = useState<GeoState>({
    position: null, accuracy: null, heading: null, error: null, errorCode: null, loading: true, manual: false,
  })
  const watchIdRef = useRef<number | null>(null)
  const highFreqRef = useRef(false)
  // A hand-set position wins over GPS until the user asks for GPS again
  // (refresh). Without this the next watchPosition fix — every few seconds on a
  // phone — overwrote the corrected point within a second: a far-away manual
  // point always passes the jitter filter, and its null accuracy counts as
  // "improved". A ref, because fixes already queued can still arrive after
  // clearWatch.
  const manualRef = useRef(false)

  const stopWatch = useCallback(() => {
    if (watchIdRef.current !== null) {
      navigator.geolocation?.clearWatch(watchIdRef.current)
      watchIdRef.current = null
    }
  }, [])

  const start = useCallback(() => {
    manualRef.current = false
    if (!navigator.geolocation) {
      setState({ position: null, accuracy: null, heading: null, error: 'Geolocation not supported', errorCode: 'unsupported', loading: false, manual: false })
      return
    }
    setState(s => ({ ...s, loading: true, error: null, errorCode: null, manual: false }))

    stopWatch()

    watchIdRef.current = navigator.geolocation.watchPosition(
      (p) => {
        if (manualRef.current) return
        setState(prev => {
          if (prev.manual) return prev
          const position: [number, number] = [p.coords.latitude, p.coords.longitude]
          const moved = prev.position ? haversine(prev.position, position) : Infinity
          const accuracyImproved = prev.accuracy !== null
            ? prev.accuracy - p.coords.accuracy >= MIN_ACCURACY_IMPROVEMENT_METERS
            : true
          const threshold = highFreqRef.current ? NAV_MIN_POSITION_UPDATE_METERS : MIN_POSITION_UPDATE_METERS

          // GPS noise filter — drop tiny jitter unless we're in nav mode
          if (prev.position && moved < threshold && !accuracyImproved) {
            return prev.loading || prev.error
              ? { ...prev, loading: false, error: null, errorCode: null }
              : prev
          }

          const computedHeading = prev.position && moved > 1
            ? bearing(prev.position, position)
            : prev.heading
          const headingFromGps = Number.isFinite(p.coords.heading) ? p.coords.heading : null

          return {
            position,
            accuracy: p.coords.accuracy,
            heading: headingFromGps ?? computedHeading,
            error: null,
            errorCode: null,
            loading: false,
            manual: false,
          }
        })
      },
      (e) => {
        if (manualRef.current) return
        setState(s => (s.manual ? s : { ...s, error: e.message, errorCode: toErrorCode(e.code), loading: false }))
      },
      GEO_OPTIONS,
    )
  }, [stopWatch])

  useEffect(() => {
    start()
    return stopWatch
  }, [start, stopWatch])

  /** Pin the position by hand and pause GPS until `refresh()`. */
  const setPosition = useCallback((pos: [number, number]) => {
    manualRef.current = true
    stopWatch()
    setState({ position: pos, accuracy: null, heading: null, error: null, errorCode: null, loading: false, manual: true })
  }, [stopWatch])

  const setHighFrequency = useCallback((enabled: boolean) => {
    highFreqRef.current = enabled
  }, [])

  return { ...state, refresh: start, setPosition, setHighFrequency }
}
