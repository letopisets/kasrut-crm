import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, renderHook } from '@testing-library/react'
import { useGeolocation } from '@/hooks/useGeolocation'

type Success = (p: GeolocationPosition) => void
type Failure = (e: GeolocationPositionError) => void

// A fake watchPosition that lets the test deliver fixes (and late, already
// queued fixes after clearWatch) whenever it wants.
let watchers: Array<{ id: number; ok: Success; fail: Failure }>
let nextId: number
const clearWatch = vi.fn()

function fix(lat: number, lng: number, accuracy = 20): GeolocationPosition {
  return { coords: { latitude: lat, longitude: lng, accuracy, heading: null } } as unknown as GeolocationPosition
}

beforeEach(() => {
  watchers = []
  nextId = 1
  clearWatch.mockReset()
  vi.stubGlobal('navigator', {
    ...navigator,
    geolocation: {
      watchPosition: (ok: Success, fail: Failure) => {
        const id = nextId++
        watchers.push({ id, ok, fail })
        return id
      },
      clearWatch,
    },
  })
})

// Unmount while the fake geolocation is still installed, then restore.
afterEach(() => { cleanup(); vi.unstubAllGlobals() })

const GPS: [number, number] = [31.7820, 35.2198]
const MANUAL: [number, number] = [32.0853, 34.7818]   // ~60 km away

describe('useGeolocation', () => {
  it('keeps a hand-set position when GPS keeps reporting (the "snaps back after a second" bug)', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => watchers[0].ok(fix(...GPS)))
    expect(result.current.position).toEqual(GPS)

    act(() => result.current.setPosition(MANUAL))
    expect(result.current.position).toEqual(MANUAL)
    expect(result.current.manual).toBe(true)
    expect(clearWatch).toHaveBeenCalledWith(1)   // GPS paused

    // a fix that was already queued arrives after clearWatch
    act(() => watchers[0].ok(fix(...GPS, 5)))
    expect(result.current.position).toEqual(MANUAL)

    // and a GPS error doesn't surface while the position is manual
    act(() => watchers[0].fail({ code: 3, message: 'timeout' } as GeolocationPositionError))
    expect(result.current.errorCode).toBeNull()
  })

  it('"my location" (refresh) resumes GPS and drops the manual position on the next fix', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => result.current.setPosition(MANUAL))

    act(() => result.current.refresh())
    expect(result.current.manual).toBe(false)
    expect(watchers).toHaveLength(2)

    act(() => watchers[1].ok(fix(...GPS)))
    expect(result.current.position).toEqual(GPS)
    expect(result.current.accuracy).toBe(20)
  })

  it('still filters GPS jitter under 75 m', () => {
    const { result } = renderHook(() => useGeolocation())
    act(() => watchers[0].ok(fix(...GPS)))
    act(() => watchers[0].ok(fix(GPS[0] + 0.0002, GPS[1])))   // ~22 m
    expect(result.current.position).toEqual(GPS)
  })
})
