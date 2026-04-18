import { useState, useMemo } from 'react'
import { useGetMapRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGeolocation }           from '@/hooks/useGeolocation'
import { useRoute }                  from '@/hooks/useRoute'
import type { MapRestaurant, MapFilters, FoodType } from '@/types'

const DEFAULT_FILTERS: MapFilters = {
  hechsher: [],
  foodType: [],
  city:     'Все',
  radius:   null,
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

  const geo    = useGeolocation()
  const router = useRoute()

  const { data: raw = [], isLoading } = useGetMapRestaurantsQuery(filters)
  const { data: optionRows = [] } = useGetMapRestaurantsQuery(DEFAULT_FILTERS)

  const availableHechshers = useMemo(() => (
    [...new Set(optionRows.map(r => r.hechsher).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'he'))
  ), [optionRows])

  const availableCities = useMemo(() => (
    ['Все', ...new Set(optionRows.map(r => r.city).filter(Boolean))]
      .sort((a, b) => (a === 'Все' ? -1 : b === 'Все' ? 1 : a.localeCompare(b, 'he')))
  ), [optionRows])

  /** Attach distance from user and apply radius filter */
  const restaurants = useMemo<MapRestaurant[]>(() => {
    const withDist = raw.map(r => ({
      ...r,
      distance: geo.position ? haversine(geo.position, [r.lat, r.lng]) : undefined,
    }))
    if (!filters.radius || !geo.position) return withDist
    return withDist.filter(r => r.distance !== undefined && r.distance <= filters.radius!)
  }, [raw, geo.position, filters.radius])

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
    (filters.city !== 'Все' ? 1 : 0) +
    (filters.radius !== null ? 1 : 0)

  return {
    // view
    view, setView,
    // filters
    filters, filterOpen, setFilterOpen,
    activeFilterCount, toggleHechsher, toggleFoodType, setCity, setRadius, resetFilters,
    availableHechshers, availableCities,
    // data
    restaurants, isLoading,
    // selected
    selected, setSelected,
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
