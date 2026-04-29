import { useEffect, useMemo } from 'react'
import { MapContainer, TileLayer, Circle, Marker, useMap, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import type { MapRestaurant, RouteData } from '@/types'
import { RestaurantMarker } from './RestaurantMarker'
import { RouteLayer }       from './RouteLayer'
import { DEFAULT_CENTER, DEFAULT_ZOOM } from '@/lib/constants'

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

interface Props {
  userPosition: [number, number] | null
  panToUser:    boolean
  correcting:   boolean
  restaurants:  MapRestaurant[]
  selected:     MapRestaurant | null
  radius:       number | null
  route:        RouteData | null
  onSelect:     (r: MapRestaurant) => void
  onPanHandled: () => void
  onMapClick:   (pos: [number, number]) => void
}

const USER_ICON = L.divIcon({
  className: '',
  iconSize:   [24, 24],
  iconAnchor: [12, 12],
  html: '<div class="km-user-dot"></div>',
})

export function MapView({ userPosition, panToUser, correcting, restaurants, selected, radius, route, onSelect, onPanHandled, onMapClick }: Props) {
  const userIcon = useMemo(() => USER_ICON, [])

  return (
    <MapContainer
      center={userPosition ?? DEFAULT_CENTER}
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

      {correcting && <MapClickHandler onMapClick={onMapClick} />}

      {panToUser && userPosition && (
        <PanTo position={userPosition} onDone={onPanHandled} />
      )}

      {userPosition && (
        <>
          {/* Radius ring */}
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

      {restaurants.map(r => (
        <RestaurantMarker
          key={r.id}
          restaurant={r}
          selected={selected?.id === r.id}
          onClick={onSelect}
        />
      ))}
    </MapContainer>
  )
}
