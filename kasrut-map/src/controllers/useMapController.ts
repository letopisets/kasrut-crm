import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useGetMapOptionsQuery, useGetMapRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGeolocation }           from '@/hooks/useGeolocation'
import { useRoute }                  from '@/hooks/useRoute'
import { useAppSelector }            from '@/store/hooks'
import type {
  MapRestaurant,
  MapFilters,
  FoodType,
  MapRestaurantQuery,
  MapRestaurantsResponse,
  MapViewport,
} from '@/types'

const DEFAULT_FILTERS: MapFilters = {
  hechsher: [],
  foodType: [],
  city:     '',
  radius:   25_000,
}

const MAP_RESTAURANT_LIMIT = 750
const QUERY_COORD_PRECISION = 4
const EMPTY_RESTAURANTS_RESPONSE: MapRestaurantsResponse = {
  restaurants: [],
  total: 0,
  limit: MAP_RESTAURANT_LIMIT,
  limited: false,
}

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value)

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delayMs)
    return () => window.clearTimeout(timer)
  }, [value, delayMs])

  return debounced
}

function roundCoord(value: number): number {
  const factor = 10 ** QUERY_COORD_PRECISION
  return Math.round(value * factor) / factor
}

function positionKey(position: [number, number] | null): string {
  return position ? `${roundCoord(position[0])}:${roundCoord(position[1])}` : ''
}

function positionFromKey(key: string): [number, number] | null {
  if (!key) return null
  const [lat, lng] = key.split(':').map(Number)
  return Number.isFinite(lat) && Number.isFinite(lng) ? [lat, lng] : null
}

function normalizeViewport(viewport: MapViewport): MapViewport {
  return {
    bounds: {
      north: roundCoord(viewport.bounds.north),
      south: roundCoord(viewport.bounds.south),
      east:  roundCoord(viewport.bounds.east),
      west:  roundCoord(viewport.bounds.west),
    },
    zoom: Math.round(viewport.zoom * 100) / 100,
  }
}

function sameViewport(a: MapViewport | null, b: MapViewport): boolean {
  return Boolean(a) &&
    a!.zoom === b.zoom &&
    a!.bounds.north === b.bounds.north &&
    a!.bounds.south === b.bounds.south &&
    a!.bounds.east === b.bounds.east &&
    a!.bounds.west === b.bounds.west
}

/** Haversine distance in metres between two [lat,lng] points */
function haversine([lat1, lng1]: [number, number], [lat2, lng2]: [number, number]): number {
  const R   = 6_371_000
  const dLat = (lat2 - lat1) * Math.PI / 180
  const dLng = (lng2 - lng1) * Math.PI / 180
  const a   = Math.sin(dLat / 2) ** 2
            + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180)
            * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export function useMapController() {
  const [view,          setView]          = useState<'map' | 'list'>('map')
  const [filters,       setFilters]       = useState<MapFilters>(DEFAULT_FILTERS)
  const [filterOpen,    setFilterOpen]    = useState(false)
  const [selected,      setSelected]      = useState<MapRestaurant | null>(null)
  const [routePanelOpen, setRoutePanelOpen] = useState(false)
  const [correcting,    setCorrecting]    = useState(false)
  const [panToUser,     setPanToUser]     = useState(false)
  const [viewport,      setViewport]      = useState<MapViewport | null>(null)

  const geo    = useGeolocation()
  const router = useRoute()
  const lang   = useAppSelector(s => s.mapLang.lang)
  const didAutoPan = useRef(false)
  const queryUserPositionKey = positionKey(geo.position)
  const queryUserPosition = useMemo(
    () => positionFromKey(queryUserPositionKey),
    [queryUserPositionKey],
  )
  const debouncedQueryUserPosition = useDebouncedValue(queryUserPosition, 1_000)

  const setStableViewport = useCallback((nextViewport: MapViewport) => {
    const normalized = normalizeViewport(nextViewport)
    setViewport(current => sameViewport(current, normalized) ? current : normalized)
  }, [])

  // Auto-pan to user's position on the very first GPS fix
  useEffect(() => {
    if (geo.position && !didAutoPan.current) {
      didAutoPan.current = true
      setPanToUser(true)
    }
  }, [geo.position])

  const restaurantQuery = useMemo<MapRestaurantQuery>(() => ({
    ...filters,
    viewport: null,
    userPosition: debouncedQueryUserPosition,
    limit: MAP_RESTAURANT_LIMIT,
  }), [debouncedQueryUserPosition, filters])

  const {
    data: restaurantPayload = EMPTY_RESTAURANTS_RESPONSE,
    isLoading,
    isFetching,
  } = useGetMapRestaurantsQuery(restaurantQuery)

  const { data: options = { cities: [], hechshers: [] } } = useGetMapOptionsQuery()

  const availableHechshers = useMemo(() => (
    [...new Set(options.hechshers.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, lang))
  ), [options.hechshers, lang])

  const availableCities = useMemo(() => (
    [...new Set(options.cities.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, lang))
  ), [options.cities, lang])

  /** Attach distance from user, apply radius filter, sort nearest first */
  const restaurants = useMemo<MapRestaurant[]>(() => {
    const withDist = restaurantPayload.restaurants.map(r => ({
      ...r,
      distance: geo.position ? haversine(geo.position, [r.lat, r.lng]) : undefined,
    }))
    const filtered = (filters.radius && geo.position)
      ? withDist.filter(r => r.distance !== undefined && r.distance <= filters.radius!)
      : withDist
    if (!geo.position) return filtered
    return [...filtered].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }, [restaurantPayload.restaurants, geo.position, filters.radius])

  const goToMyLocation  = () => { geo.refresh(); setPanToUser(true) }
  const startCorrection = () => { setCorrecting(true); setView('map') }
  const stopCorrection  = () => setCorrecting(false)
  const applyPosition   = (pos: [number, number]) => {
    geo.setPosition(pos)
    setCorrecting(false)
    setPanToUser(true)
  }

  const startRoute = (r: MapRestaurant) => {
    if (!geo.position) return
    setSelected(r)
    setView('map')
    router.fetchRoute(geo.position, [r.lat, r.lng])
    setRoutePanelOpen(true)
  }

  const stopRoute = () => {
    router.clearRoute()
    setRoutePanelOpen(false)
  }

  const toggleHechsher = (hechsher: string) =>
    setFilters(f => ({
      ...f,
      hechsher: f.hechsher.includes(hechsher)
        ? f.hechsher.filter(h => h !== hechsher)
        : [...f.hechsher, hechsher],
    }))

  const toggleFoodType = (type: FoodType) =>
    setFilters(f => ({
      ...f,
      foodType: f.foodType.includes(type)
        ? f.foodType.filter(t => t !== type)
        : [...f.foodType, type],
    }))

  const setCity   = (city: string)         => setFilters(f => ({ ...f, city }))
  const setRadius = (radius: number | null) => setFilters(f => ({ ...f, radius }))
  const resetFilters = ()                  => setFilters(DEFAULT_FILTERS)

  const activeFilterCount =
    filters.hechsher.length +
    filters.foodType.length +
    (filters.city !== '' ? 1 : 0) +
    (filters.radius !== null ? 1 : 0)

  return {
    // view
    view, setView,
    // filters
    filters, filterOpen, setFilterOpen,
    activeFilterCount, toggleHechsher, toggleFoodType, setCity, setRadius, resetFilters,
    availableHechshers, availableCities,
    // data
    restaurants,
    isLoading,
    isFetching,
    restaurantTotal: restaurantPayload.total,
    restaurantLimit: restaurantPayload.limit,
    restaurantResultLimited: restaurantPayload.limited,
    // selected
    selected, setSelected,
    // viewport
    viewport, setViewport: setStableViewport,
    // geolocation
    geo,
    // location correction
    correcting, goToMyLocation, startCorrection, stopCorrection, applyPosition,
    panToUser, onPanHandled: () => setPanToUser(false),
    // routing
    route:          router.route,
    routeLoading:   router.loading,
    routeError:     router.error,
    routePanelOpen, setRoutePanelOpen,
    startRoute, stopRoute,
    formatDist:  router.formatDist,
    formatTime:  router.formatTime,
  }
}
