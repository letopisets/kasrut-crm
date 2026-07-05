import { useCallback, useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import 'leaflet-rotate'
import type { MapRestaurant, MapViewport, RouteData } from '@/types'
import { RestaurantMarker } from './RestaurantMarker'
import { RouteLayer }       from './RouteLayer'
import { DEFAULT_ZOOM, NAV_ZOOM } from '@/lib/constants'
import { buildClusterIndex, getRenderItems } from '@/lib/clusterIndex'

type RotatableMap = L.Map & {
  setBearing?: (deg: number) => void
}

// Fix Leaflet default icon broken in Vite
delete (L.Icon.Default.prototype as unknown as Record<string, unknown>)['_getIconUrl']
L.Icon.Default.mergeOptions({
  iconUrl:       new URL('leaflet/dist/images/marker-icon.png',    import.meta.url).href,
  iconRetinaUrl: new URL('leaflet/dist/images/marker-icon-2x.png', import.meta.url).href,
  shadowUrl:     new URL('leaflet/dist/images/marker-shadow.png',  import.meta.url).href,
})

/** Centers map on the user's position once, then calls onDone */
function PanTo({ position, onDone }: { position: [number, number]; onDone: () => void }) {
  const map = useMap()
  useEffect(() => {
    map.setView(position, Math.max(map.getZoom(), DEFAULT_ZOOM), { animate: true })
    onDone()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Keeps the map centered on the user while followUser is true. */
function FollowController({
  position, followUser, onFollowHandled,
}: {
  position: [number, number] | null
  followUser: boolean
  onFollowHandled: () => void
}) {
  const map = useMap()
  useEffect(() => {
    if (!followUser || !position) return
    const targetZoom = Math.max(map.getZoom(), NAV_ZOOM)
    map.setView(position, targetZoom, { animate: true, duration: 0.5 })
    onFollowHandled()
  }, [followUser, position, map, onFollowHandled])
  return null
}

/** Rotates the map by `bearing` degrees while in navigate mode. */
function BearingController({ bearing, active }: { bearing: number | null; active: boolean }) {
  const map = useMap() as RotatableMap
  useEffect(() => {
    if (!map.setBearing) return
    if (!active) {
      map.setBearing(0)
      return
    }
    if (bearing == null || !Number.isFinite(bearing)) return
    map.setBearing(-bearing)
  }, [bearing, active, map])
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

function makeClusterIcon(count: number): L.DivIcon {
  return L.divIcon({
    className: '',
    iconSize: [42, 42],
    iconAnchor: [21, 21],
    html: `<div class="km-cluster">${count}</div>`,
  })
}

function ClusterMarker({
  count, position, expansionZoom,
}: {
  count: number
  position: [number, number]
  expansionZoom: number
}) {
  const map = useMap()
  const icon = useMemo(() => makeClusterIcon(count), [count])
  const eventHandlers = useMemo(() => ({
    click: () => map.setView(position, expansionZoom, { animate: true }),
  }), [map, position, expansionZoom])

  return (
    <Marker
      position={position}
      icon={icon}
      eventHandlers={eventHandlers}
    />
  )
}

interface Props {
  userPosition: [number, number] | null
  gpsAccuracy:  number | null
  userHeading:  number | null
  initialCenter: [number, number]
  panToUser:    boolean
  followUser:   boolean
  navigating:   boolean
  correcting:   boolean
  restaurants:  MapRestaurant[]
  selected:     MapRestaurant | null
  viewport:     MapViewport | null
  radius:       number | null
  route:        RouteData | null
  onSelect:     (r: MapRestaurant) => void
  onPanHandled: () => void
  onFollowHandled: () => void
  onMapClick:   (pos: [number, number]) => void
  onViewportChange: (viewport: MapViewport) => void
}

const USER_ICON = L.divIcon({
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
  html: '<div class="km-user-dot"></div>',
})

function makeNavIcon(bearing: number | null): L.DivIcon {
  const angle = bearing ?? 0
  return L.divIcon({
    className: '',
    iconSize:   [40, 40],
    iconAnchor: [20, 20],
    html: `<div class="km-user-nav" style="transform: rotate(${angle}deg)"></div>`,
  })
}

export function MapView({
  userPosition,
  gpsAccuracy,
  userHeading,
  initialCenter,
  panToUser,
  followUser,
  navigating,
  correcting,
  restaurants,
  selected,
  viewport,
  radius,
  route,
  onSelect,
  onPanHandled,
  onFollowHandled,
  onMapClick,
  onViewportChange,
}: Props) {
  const userIcon = useMemo(
    () => navigating ? makeNavIcon(userHeading) : USER_ICON,
    [navigating, userHeading],
  )
  // Spatial index over everything loaded (minus the selected pin); the render
  // list is then just the clusters/pins inside the current viewport, so
  // off-screen restaurants never become DOM nodes.
  const clusterIndex = useMemo(
    () => buildClusterIndex(restaurants, selected?.id),
    [restaurants, selected?.id],
  )
  const renderItems = useMemo(
    () => getRenderItems(clusterIndex, viewport, DEFAULT_ZOOM),
    [clusterIndex, viewport],
  )
  // The selected restaurant is excluded from the index and rendered as its
  // own pin whenever a selection exists, so it never gets swallowed by a
  // cluster and stays visible even when the marker layer is empty (low zoom,
  // filtered out). Prefer the fresh copy from the current results over the
  // possibly stale object held in selection state.
  const selectedOnMap = selected
    ? restaurants.find(r => r.id === selected.id) ?? selected
    : null

  const mapOptions = { rotate: true, rotateControl: false, touchRotate: false } as L.MapOptions

  return (
    <MapContainer
      center={userPosition ?? initialCenter}
      zoom={DEFAULT_ZOOM}
      style={{ width: '100%', height: '100%' }}
      className={correcting ? 'km-correcting' : undefined}
      zoomControl={false}
      {...mapOptions}
    >
      <TileLayer
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        referrerPolicy="origin"
      />

      <ViewportReporter onViewportChange={onViewportChange} />

      {correcting && <MapClickHandler onMapClick={onMapClick} />}

      {panToUser && userPosition && (
        <PanTo position={userPosition} onDone={onPanHandled} />
      )}

      <FollowController
        position={userPosition}
        followUser={followUser}
        onFollowHandled={onFollowHandled}
      />

      <BearingController bearing={userHeading} active={navigating} />

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
          expansionZoom={item.expansionZoom}
        />
      ) : (
        <RestaurantMarker
          key={item.restaurant.id}
          restaurant={item.restaurant}
          selected={false}
          onClick={onSelect}
        />
      ))}

      {selectedOnMap && (
        <RestaurantMarker
          key={selectedOnMap.id}
          restaurant={selectedOnMap}
          selected
          onClick={onSelect}
        />
      )}
    </MapContainer>
  )
}
