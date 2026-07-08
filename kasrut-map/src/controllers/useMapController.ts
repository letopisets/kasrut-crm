import { useCallback, useState, useMemo, useEffect, useRef } from 'react'
import { useGetMapOptionsQuery, useGetMapRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGeolocation }           from '@/hooks/useGeolocation'
import { useRoute }                  from '@/hooks/useRoute'
import { useActiveStep }             from '@/hooks/useActiveStep'
import { useAppSelector }            from '@/store/hooks'

export type RouteMode = 'steps' | 'navigate'
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
  category: [],
  city:     '',
  radius:   25_000,
}

const MAP_RESTAURANT_LIMIT = 750
// Matches the server-side cache grid (~110 m): finer client precision would
// only mint new query-cache entries (and network refetches while moving)
// without ever changing what the server returns.
const QUERY_COORD_PRECISION = 3
// Viewport bounds never reach the server — they only feed marker culling and
// the suggestion-dialog default position, so they keep ~11 m precision.
const VIEWPORT_COORD_PRECISION = 4
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

function roundViewportCoord(value: number): number {
  const factor = 10 ** VIEWPORT_COORD_PRECISION
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
      north: roundViewportCoord(viewport.bounds.north),
      south: roundViewportCoord(viewport.bounds.south),
      east:  roundViewportCoord(viewport.bounds.east),
      west:  roundViewportCoord(viewport.bounds.west),
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

interface UseMapControllerOptions {
  /** Used as fallback query position when GPS is unavailable, so the count
   *  badge appears even before (or without) a GPS fix. */
  fallbackPosition?: [number, number] | null
  /** When true, `fallbackPosition` is considered final (resolved or settled).
   *  While false AND no GPS fix has arrived, the restaurants query is skipped
   *  to avoid firing once with DEFAULT_CENTER and again with the real IP centre. */
  fallbackReady?: boolean
}

export function useMapController({
  fallbackPosition = null,
  fallbackReady = true,
}: UseMapControllerOptions = {}) {
  const [view,          setView]          = useState<'map' | 'list'>('map')
  const [filters,       setFilters]       = useState<MapFilters>(DEFAULT_FILTERS)
  const [filterOpen,    setFilterOpen]    = useState(false)
  // Whether the user has ever opened the filter panel — gates the
  // /map/options request so cold loads do not pay for data the user may
  // never see. Once we have the options we keep them around (no refetch).
  const [filterEverOpened, setFilterEverOpened] = useState(false)
  const [selected,      setSelected]      = useState<MapRestaurant | null>(null)
  const [routePanelOpen, setRoutePanelOpen] = useState(false)
  const [routeMode,     setRouteMode]     = useState<RouteMode>('steps')
  const [followUser,    setFollowUser]    = useState(false)
  const [correcting,    setCorrecting]    = useState(false)
  const [panToUser,     setPanToUser]     = useState(false)
  const [focusTarget,   setFocusTarget]   = useState<[number, number] | null>(null)
  const [viewport,      setViewport]      = useState<MapViewport | null>(null)

  const geo    = useGeolocation()
  const router = useRoute()
  const lang   = useAppSelector(s => s.mapLang.lang)
  const didAutoPan = useRef(false)

  // Effective position used for radius queries and distance display. Prefers
  // GPS but falls back to the caller-provided position (e.g. IP-based) so the
  // list still populates when GPS is denied or still resolving.
  const effectivePosition = geo.position ?? fallbackPosition
  const queryUserPositionKey = positionKey(effectivePosition)
  const queryUserPosition = useMemo(
    () => positionFromKey(queryUserPositionKey),
    [queryUserPositionKey],
  )
  // GPS itself already filters jitter via MIN_POSITION_UPDATE_METERS, so a
  // short debounce is enough to coalesce burst updates without making the
  // user wait a full second for the count badge after the first fix.
  const debouncedQueryUserPosition = useDebouncedValue(queryUserPosition, 300)

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

  // Always query restaurants within the user's coverage radius — independent
  // of the current map viewport — so the list reflects the user's area, not
  // whatever portion of the map is currently visible.
  const restaurantQuery = useMemo<MapRestaurantQuery>(() => ({
    ...filters,
    viewport: null,
    userPosition: debouncedQueryUserPosition,
    limit: MAP_RESTAURANT_LIMIT,
  }), [debouncedQueryUserPosition, filters])
  const shouldSkipRestaurants = !debouncedQueryUserPosition

  // Skip until either GPS gives us a real fix OR the fallback (IP lookup) has
  // settled. Without this guard a cold load fires the query once on the cached
  // DEFAULT_CENTER and again on the resolved IP centre.
  const skipUntilPositionReady = !geo.position && !fallbackReady
  const {
    data: restaurantPayload = EMPTY_RESTAURANTS_RESPONSE,
    isLoading,
    isFetching,
  } = useGetMapRestaurantsQuery(restaurantQuery, {
    skip: shouldSkipRestaurants || skipUntilPositionReady,
  })

  const { data: options = { cities: [], hechshers: [], categories: [] } } = useGetMapOptionsQuery(
    undefined,
    { skip: !filterEverOpened },
  )

  const availableHechshers = useMemo(() => (
    [...new Set(options.hechshers.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, lang))
  ), [options.hechshers, lang])

  const availableCategories = useMemo(() => (
    [...options.categories].sort((a, b) =>
      (lang === 'he' ? a.nameHe : lang === 'ru' ? (a.nameRu ?? a.nameHe) : (a.nameEn ?? a.nameHe))
        .localeCompare(lang === 'he' ? b.nameHe : lang === 'ru' ? (b.nameRu ?? b.nameHe) : (b.nameEn ?? b.nameHe), lang))
  ), [options.categories, lang])

  const availableCities = useMemo(() => (
    [...new Set(options.cities.filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, lang))
  ), [options.cities, lang])

  /** Map layer: the restaurant objects from the query cache, radius-filtered
   *  but NOT copied or annotated. Preserving object identity across GPS
   *  updates lets memoized markers skip re-rendering — annotating distance
   *  here would mint 750 new objects on every accepted position change. */
  const mapRestaurants = useMemo<MapRestaurant[]>(() => {
    if (!filters.radius || !effectivePosition) return restaurantPayload.restaurants
    return restaurantPayload.restaurants.filter(r =>
      haversine(effectivePosition, [r.lat, r.lng]) <= filters.radius!)
  }, [restaurantPayload.restaurants, effectivePosition, filters.radius])

  /** List layer: same set, annotated with distance and sorted nearest first. */
  const restaurants = useMemo<MapRestaurant[]>(() => {
    if (!effectivePosition) return mapRestaurants
    return mapRestaurants
      .map(r => ({ ...r, distance: haversine(effectivePosition, [r.lat, r.lng]) }))
      .sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))
  }, [mapRestaurants, effectivePosition])

  /** Detail-sheet copy of the selection with an up-to-date distance. */
  const selectedWithDistance = useMemo<MapRestaurant | null>(() => {
    if (!selected) return null
    if (!effectivePosition) return selected
    return { ...selected, distance: haversine(effectivePosition, [selected.lat, selected.lng]) }
  }, [selected, effectivePosition])

  // Stable function pieces of the geo/route hooks, so callbacks below do not
  // pick up a new identity every render (the hook objects themselves are
  // recreated each time).
  const { refresh: refreshGeo, setPosition: setGeoPosition, setHighFrequency } = geo
  const { fetchRoute, clearRoute } = router

  const goToMyLocation = useCallback(() => {
    refreshGeo()
    setPanToUser(true)
  }, [refreshGeo])
  const startCorrection = useCallback(() => { setCorrecting(true); setView('map') }, [])
  const stopCorrection  = useCallback(() => setCorrecting(false), [])
  const applyPosition   = useCallback((pos: [number, number]) => {
    setGeoPosition(pos)
    setCorrecting(false)
    setPanToUser(true)
  }, [setGeoPosition])
  const onPanHandled        = useCallback(() => setPanToUser(false), [])
  const onFollowUserHandled = useCallback(() => setFollowUser(false), [])
  const onFocusHandled      = useCallback(() => setFocusTarget(null), [])

  // Selecting a place from the list: open its detail sheet on the map AND fly
  // the camera to its coordinates, so the user lands on the picked address
  // instead of wherever the map happened to be sitting.
  const focusRestaurant = useCallback((r: MapRestaurant) => {
    // A deliberate list pick pre-empts the one-shot "pan to me on the first GPS
    // fix": without this, a fix landing during/after the focus fly would raise
    // panToUser and yank the camera off the picked address onto the user.
    didAutoPan.current = true
    setSelected(r)
    setView('map')
    setFocusTarget([r.lat, r.lng])
  }, [])

  const geoPosition = geo.position
  const startRoute = useCallback((r: MapRestaurant) => {
    if (!geoPosition) return
    setSelected(r)
    setView('map')
    fetchRoute(geoPosition, [r.lat, r.lng])
    setRoutePanelOpen(true)
    setRouteMode('steps')
    setFollowUser(false)
  }, [fetchRoute, geoPosition])

  const stopRoute = useCallback(() => {
    clearRoute()
    setRoutePanelOpen(false)
    setRouteMode('steps')
    setFollowUser(false)
  }, [clearRoute])

  const enterNavigation = useCallback(() => {
    setRouteMode('navigate')
    setFollowUser(true)
  }, [])

  const exitNavigation = useCallback(() => {
    setRouteMode('steps')
    setFollowUser(false)
  }, [])

  const recenterOnUser = useCallback(() => {
    setFollowUser(true)
  }, [])

  // High-frequency GPS only while actively navigating
  useEffect(() => {
    setHighFrequency(routeMode === 'navigate')
  }, [routeMode, setHighFrequency])

  const activeStep = useActiveStep(router.route, geo.position)

  const toggleHechsher = useCallback((hechsher: string) =>
    setFilters(f => ({
      ...f,
      hechsher: f.hechsher.includes(hechsher)
        ? f.hechsher.filter(h => h !== hechsher)
        : [...f.hechsher, hechsher],
    })), [])

  const toggleFoodType = useCallback((type: FoodType) =>
    setFilters(f => ({
      ...f,
      foodType: f.foodType.includes(type)
        ? f.foodType.filter(t => t !== type)
        : [...f.foodType, type],
    })), [])

  const toggleCategory = useCallback((slug: string) =>
    setFilters(f => ({
      ...f,
      category: f.category.includes(slug)
        ? f.category.filter(c => c !== slug)
        : [...f.category, slug],
    })), [])

  const setCity      = useCallback((city: string)          => setFilters(f => ({ ...f, city })), [])
  const setRadius    = useCallback((radius: number | null) => setFilters(f => ({ ...f, radius })), [])
  const resetFilters = useCallback(()                      => setFilters(DEFAULT_FILTERS), [])

  const activeFilterCount =
    filters.hechsher.length +
    filters.foodType.length +
    filters.category.length +
    (filters.city !== '' ? 1 : 0) +
    (filters.radius !== null ? 1 : 0)

  const openFilters = useCallback((open: boolean) => {
    setFilterOpen(open)
    if (open) setFilterEverOpened(true)
  }, [])

  return {
    // view
    view, setView,
    // filters
    filters, filterOpen, setFilterOpen: openFilters,
    activeFilterCount, toggleHechsher, toggleFoodType, toggleCategory, setCity, setRadius, resetFilters,
    availableHechshers, availableCities, availableCategories,
    // data
    restaurants,
    mapRestaurants,
    isLoading,
    isFetching,
    restaurantTotal: restaurantPayload.total,
    restaurantLimit: restaurantPayload.limit,
    restaurantResultLimited: restaurantPayload.limited,
    // selected
    selected, selectedWithDistance, setSelected, focusRestaurant,
    // camera focus (fly-to a place picked from the list)
    focusTarget, onFocusHandled,
    // viewport
    viewport, setViewport: setStableViewport,
    // geolocation
    geo,
    // location correction
    correcting, goToMyLocation, startCorrection, stopCorrection, applyPosition,
    panToUser, onPanHandled,
    // routing
    route:          router.route,
    routeLoading:   router.loading,
    routeError:     router.error,
    routePanelOpen, setRoutePanelOpen,
    routeMode,
    activeStep,
    followUser,
    onFollowUserHandled,
    startRoute, stopRoute,
    enterNavigation, exitNavigation, recenterOnUser,
    formatDist:  router.formatDist,
    formatTime:  router.formatTime,
  }
}
