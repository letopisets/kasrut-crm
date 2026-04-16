import { useState, useMemo } from 'react'
import { useGetMapRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGeolocation }           from '@/hooks/useGeolocation'
import { useRoute }                  from '@/hooks/useRoute'
import type { MapRestaurant, MapFilters, FoodType, KashrutLevel } from '@/types'

const DEFAULT_FILTERS: MapFilters = {
  kashrutLevel: [],
  foodType:     [],
  city:         'Все',
  radius:       null,
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
  const [view,        setView]        = useState<'map' | 'list'>('map')
  const [filters,     setFilters]     = useState<MapFilters>(DEFAULT_FILTERS)
  const [filterOpen,  setFilterOpen]  = useState(false)
  const [selected,    setSelected]    = useState<MapRestaurant | null>(null)
  const [routePanelOpen, setRoutePanelOpen] = useState(false)

  const geo    = useGeolocation()
  const router = useRoute()

  const { data: raw = [], isLoading } = useGetMapRestaurantsQuery(filters)

  /** Attach distance from user and apply radius filter */
  const restaurants = useMemo<MapRestaurant[]>(() => {
    const withDist = raw.map(r => ({
      ...r,
      distance: geo.position ? haversine(geo.position, [r.lat, r.lng]) : undefined,
    }))
    if (!filters.radius || !geo.position) return withDist
    return withDist.filter(r => r.distance !== undefined && r.distance <= filters.radius!)
  }, [raw, geo.position, filters.radius])

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

  const toggleKashrutLevel = (level: KashrutLevel) =>
    setFilters(f => ({
      ...f,
      kashrutLevel: f.kashrutLevel.includes(level)
        ? f.kashrutLevel.filter(l => l !== level)
        : [...f.kashrutLevel, level],
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
    filters.kashrutLevel.length +
    filters.foodType.length +
    (filters.city !== 'Все' ? 1 : 0) +
    (filters.radius !== null ? 1 : 0)

  return {
    // view
    view, setView,
    // filters
    filters, filterOpen, setFilterOpen,
    activeFilterCount, toggleKashrutLevel, toggleFoodType, setCity, setRadius, resetFilters,
    // data
    restaurants, isLoading,
    // selected
    selected, setSelected,
    // geolocation
    geo,
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
