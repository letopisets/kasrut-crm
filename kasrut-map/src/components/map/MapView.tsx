import { useCallback, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapRestaurant, MapViewport, RouteData } from '@/types'
import { RestaurantMarker } from './RestaurantMarker'
import { RouteLayer }       from './RouteLayer'
import { DEFAULT_ZOOM } from '@/lib/constants'

// Fix Leaflet default icon broken in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl']
L.Icon.Default.mergeOptions({
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
})

/** Pans map to position once, then calls onDone */
function PanTo({ position, onDone }: { position: [number, number]; onDone: () => void }) {
  const map = useMap()
  useEffect(() => {
    map.panTo(position)
    onDone()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Fires onMapClick when the user clicks anywhere on the map */
function MapClickHandler({ onMapClick }: { onMapClick: (pos: [number, number]) => void }) {
  useMapEvents({ click: (e) => onMapClick([e.latlng.lat, e.latlng.lng]) })
  return null
}

function toViewport(map: L.Map): MapViewport {
  const bounds = map.getBounds()
  return {
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east:  bounds.getEast(),
      west:  bounds.getWest(),
    },
    zoom: map.getZoom(),
  }
}

/** Reports current bounds after map movement so API can load only visible markers. */
function ViewportReporter({ onViewportChange }: { onViewportChange: (viewport: MapViewport) => void }) {
  const map = useMap()
  const report = useCallback(() => {
    onViewportChange(toViewport(map))
  }, [map, onViewportChange])

  useEffect(() => {
    report()
  }, [report])

  useMapEvents({
    moveend: report,
    zoomend: report,
    resize: report,
  })
  return null
}

interface ClusterRenderItem {
  type: 'cluster'
  id: string
  count: number
  position: [number, number]
}

interface RestaurantRenderItem {
  type: 'restaurant'
  restaurant: MapRestaurant
}

type RenderItem = ClusterRenderItem | RestaurantRenderItem

function clusterCellSize(zoom: number): number {
  if (zoom >= 16) return 0
  if (zoom >= 15) return 0.0015
  if (zoom >= 14) return 0.003
  if (zoom >= 13) return 0.006
  if (zoom >= 12) return 0.012
  if (zoom >= 11) return 0.024
  return 0.05
}

function clusterRestaurants(restaurants: MapRestaurant[], zoom: number, selectedId?: string): RenderItem[] {
  const cellSize = clusterCellSize(zoom)
  if (cellSize === 0 || restaurants.length <= 120) {
    return restaurants.map(restaurant => ({ type: 'restaurant' as const, restaurant }))
  }

  const clusters = new Map<string, { count: number; latSum: number; lngSum: number; restaurants: MapRestaurant[] }>()
  const items: RenderItem[] = []

  for (const restaurant of restaurants) {
    if (restaurant.id === selectedId) {
      items.push({ type: 'restaurant', restaurant })
      continue
    }

    const key = `${Math.floor(restaurant.lat / cellSize)}:${Math.floor(restaurant.lng / cellSize)}`
    const cluster = clusters.get(key)
    if (cluster) {
      cluster.count += 1
      cluster.latSum += restaurant.lat
      cluster.lngSum += restaurant.lng
      cluster.restaurants.push(restaurant)
    } else {
      clusters.set(key, {
        count: 1,
        latSum: restaurant.lat,
        lngSum: restaurant.lng,
        restaurants: [restaurant],
      })
    }
  }

  for (const [key, cluster] of clusters) {
    if (cluster.count === 1) {
      items.push({ type: 'restaurant', restaurant: cluster.restaurants[0] })
      continue
    }

    items.push({
      type: 'cluster',
      id: key,
      count: cluster.count,
      position: [cluster.latSum / cluster.count, cluster.lngSum / cluster.count],
    })
  }

  return items
}

function makeClusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<div class="km-cluster">${count}</div>`,
  })
}

function ClusterMarker({ count, position }: { count: number; position: [number, number] }) {
  const map = useMap()
  const icon = useMemo(() => makeClusterIcon(count), [count])
  const eventHandlers = useMemo(() => ({
    click: () => map.setView(position, Math.min(map.getZoom() + 2, 19), { animate: true }),
  }), [map, position])

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  )
}

function FitRestaurants({ restaurants, triggerKey }: { restaurants: MapRestaurant[]; triggerKey: number }) {
  const map = useMap()
  useEffect(() => {
    if (!triggerKey || restaurants.length === 0) return
    const bounds = L.latLngBounds(restaurants.map(r => [r.lat, r.lng] as [number, number]))
    if (bounds.isValid()) {
      map.fitBounds(bounds.pad(0.16), { maxZoom: 15, animate: true })
    }
  }, [map, restaurants, triggerKey])
  return null
}

interface Props {
  userPosition: [number, number] | null
  gpsAccuracy:  number | null
  initialCenter: [number, number]
  panToUser:    boolean
  correcting:   boolean
  restaurants:  MapRestaurant[]
  selected:     MapRestaurant | null
  viewport:     MapViewport | null
  radius:       number | null
  route:        RouteData | null
  fitRestaurantsKey: number
  onSelect:     (r: MapRestaurant) => void
  onPanHandled: () => void
  onMapClick:   (pos: [number, number]) => void
  onViewportChange: (viewport: MapViewport) => void
}

const USER_ICON = L.divIcon({
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
  html: '<div class="km-user-dot"></div>',
})

export function MapView({
  userPosition,
  gpsAccuracy,
  initialCenter,
  panToUser,
  correcting,
  restaurants,
  selected,
  viewport,
  radius,
  route,
  fitRestaurantsKey,
  onSelect,
  onPanHandled,
  onMapClick,
  onViewportChange,
}: Props) {
  const userIcon = useMemo(() => USER_ICON, [])
  const renderItems = useMemo(
    () => clusterRestaurants(restaurants, viewport?.zoom ?? DEFAULT_ZOOM, selected?.id),
    [restaurants, selected?.id, viewport?.zoom],
  )

  return (
    <MapContainer
      center={userPosition ?? initialCenter}
      zoom={DEFAULT_ZOOM}
      style={{ width: '100%', height: '100%' }}
      className={correcting ? 'km-correcting' : undefined}
      zoomControl={false}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        referrerPolicy="origin"
      />

      <ViewportReporter onViewportChange={onViewportChange} />
      <FitRestaurants restaurants={restaurants} triggerKey={fitRestaurantsKey} />

      {correcting && <MapClickHandler onMapClick={onMapClick} />}

      {panToUser && userPosition && (
        <PanTo position={userPosition} onDone={onPanHandled} />
      )}

      {userPosition && (
        <>
          {/* Radius ring (filter) */}
          {radius && (
            <Circle
              center={userPosition}
              radius={radius}
              pathOptions={{
                color: '#E8A507', fillColor: '#E8A507',
                fillOpacity: 0.06, weight: 1.5, dashArray: '6 4',
              }}
            />
          )}
          {/* GPS accuracy circle — shows location precision (small = precise, large = IP-based) */}
          {gpsAccuracy && gpsAccuracy > 50 && (
            <Circle
              center={userPosition}
              radius={gpsAccuracy}
              pathOptions={{
                color: '#4A90D9', fillColor: '#4A90D9',
                fillOpacity: 0.12, weight: 1, dashArray: undefined,
              }}
            />
          )}
          {/* User dot — pulsing gold DivIcon */}
          <Marker
            position={userPosition}
            icon={userIcon}
            interactive={false}
            zIndexOffset={2000}
          />
        </>
      )}

      {route && selected && (
        <RouteLayer route={route} destination={[selected.lat, selected.lng]} />
      )}

      {renderItems.map(item => item.type === 'cluster' ? (
        <ClusterMarker
          key={`cluster:${item.id}`}
          count={item.count}
          position={item.position}
        />
      ) : (
        <RestaurantMarker
          key={item.restaurant.id}
          restaurant={item.restaurant}
          selected={selected?.id === item.restaurant.id}
          onClick={onSelect}
        />
      ))}
    </MapContainer>
  )
}
