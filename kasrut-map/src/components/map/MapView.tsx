import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Map, { Marker, useMap } from 'react-map-gl/maplibre'
import type { MapRef, MapLayerMouseEvent, MarkerEvent, ViewStateChangeEvent } from 'react-map-gl/maplibre'
import maplibregl from 'maplibre-gl'
import 'maplibre-gl/dist/maplibre-gl.css'
import type { MapRestaurant, MapViewport, RouteData } from '@/types'
import type { ThemeMode } from '@/theme'
import { RestaurantMarker } from './RestaurantMarker'
import { RouteLayer }       from './RouteLayer'
import { CirclesLayer }     from './CirclesLayer'
import { DEFAULT_ZOOM, NAV_ZOOM, FOCUS_ZOOM } from '@/lib/constants'
import { toClassicZoom, toMapZoom } from '@/lib/mapZoom'
import { buildClusterIndex, getRenderItems } from '@/lib/clusterIndex'

// Hebrew (and Arabic) labels only render in the correct character order with
// the RTL text plugin. `true` = lazy: it loads the first time RTL text is on
// screen, which for an Israel-centred map is immediately, but keeps the
// plugin off the critical path. The file is vendored in public/rtl-text
// (from @mapbox/mapbox-gl-rtl-text 0.4.0, BSD-2-Clause — its package exports
// hide the dist build from bundlers).
if (maplibregl.getRTLTextPluginStatus() === 'unavailable') {
  void maplibregl.setRTLTextPlugin('/rtl-text/mapbox-gl-rtl-text-0.4.0.js', true)
}

const STYLE_URL: Record<ThemeMode, string> = {
  light: 'https://tiles.openfreemap.org/styles/liberty',
  dark:  'https://tiles.openfreemap.org/styles/dark',
}

function toViewport(map: maplibregl.Map): MapViewport {
  const bounds = map.getBounds()
  return {
    bounds: {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east:  bounds.getEast(),
      west:  bounds.getWest(),
    },
    zoom: toClassicZoom(map.getZoom()),
  }
}

function ClusterMarker({
  count, position, expansionZoom,
}: {
  count: number
  position: [number, number]
  expansionZoom: number
}) {
  const { current: map } = useMap()
  const handleClick = useCallback((e: MarkerEvent<MouseEvent>) => {
    // Marker clicks bubble into the map's own click handler (both live on the
    // canvas container) — without this, a tap in correction mode would also
    // apply the cluster's location as the user's corrected position.
    e.originalEvent.stopPropagation()
    map?.easeTo({
      center: [position[1], position[0]],
      zoom: toMapZoom(expansionZoom),
      duration: 400,
    })
  }, [map, position, expansionZoom])

  return (
    <Marker
      longitude={position[1]}
      latitude={position[0]}
      anchor="center"
      onClick={handleClick}
    >
      <div className="km-cluster">{count}</div>
    </Marker>
  )
}

/**
 * User-position marker: pulsing dot, or a heading arrow while navigating.
 * The arrow is drawn relative to the MAP (rotationAlignment="map"), so it
 * points along the travel direction whether or not the map itself is
 * rotated to heading-up.
 */
function UserMarker({
  position, navigating, heading,
}: {
  position: [number, number]
  navigating: boolean
  heading: number | null
}) {
  return (
    <Marker
      longitude={position[1]}
      latitude={position[0]}
      anchor="center"
      rotation={navigating ? heading ?? 0 : 0}
      rotationAlignment="map"
      pitchAlignment="viewport"
      style={{ pointerEvents: 'none', zIndex: 3 }}
    >
      <div className={navigating ? 'km-user-nav' : 'km-user-dot'} />
    </Marker>
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
  focusTarget:  [number, number] | null
  viewport:     MapViewport | null
  radius:       number | null
  route:        RouteData | null
  themeMode:    ThemeMode
  onSelect:     (r: MapRestaurant) => void
  onPanHandled: () => void
  onFollowHandled: () => void
  onFocusHandled: () => void
  onMapClick:   (pos: [number, number]) => void
  onViewportChange: (viewport: MapViewport) => void
}

// Memoized: MapPage re-renders on plenty of unrelated state (dialogs,
// fetching indicator, snackbars); with stable props the whole map subtree
// — up to 750 markers — skips reconciliation entirely.
export const MapView = memo(function MapView({
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
  focusTarget,
  viewport,
  radius,
  route,
  themeMode,
  onSelect,
  onPanHandled,
  onFollowHandled,
  onFocusHandled,
  onMapClick,
  onViewportChange,
}: Props) {
  const mapRef = useRef<MapRef>(null)
  // react-map-gl creates the maplibre instance asynchronously, so
  // mapRef.current is null during the first effect passes. Camera effects
  // below depend on this flag so intents that arrive before the map exists
  // (e.g. a cached GPS fix setting panToUser at mount) replay once it loads.
  const [mapReady, setMapReady] = useState(false)

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

  const reportViewport = useCallback((e: ViewStateChangeEvent | maplibregl.MapLibreEvent) => {
    onViewportChange(toViewport(e.target))
  }, [onViewportChange])

  const handleLoad = useCallback((e: maplibregl.MapLibreEvent) => {
    // User-driven rotation stays off (parity with the Leaflet version);
    // navigation mode rotates the map programmatically.
    e.target.touchZoomRotate.disableRotation()
    e.target.keyboard.disableRotation()
    reportViewport(e)
    setMapReady(true)
  }, [reportViewport])

  // If the style fails to load (offline, blocked host), the 'load' event
  // never fires — still report the viewport so the marker layer and zoom
  // gating keep working over the blank canvas.
  const handleError = useCallback(() => {
    const map = mapRef.current
    if (map) onViewportChange(toViewport(map.getMap()))
  }, [onViewportChange])

  const handleClick = useCallback((e: MapLayerMouseEvent) => {
    if (correcting) onMapClick([e.lngLat.lat, e.lngLat.lng])
  }, [correcting, onMapClick])

  const headingValid = userHeading != null && Number.isFinite(userHeading)

  // Centers the map on the user once (my-location button / first GPS fix).
  // Gated on mapReady so an intent raised before the map instance exists is
  // replayed on load instead of being consumed against a null ref.
  useEffect(() => {
    if (!mapReady || !panToUser || !userPosition) return
    const map = mapRef.current
    if (!map) return
    map.flyTo({
      center: [userPosition[1], userPosition[0]],
      zoom: Math.max(map.getZoom(), toMapZoom(DEFAULT_ZOOM)),
      duration: 800,
    })
    onPanHandled()
  }, [mapReady, panToUser, userPosition, onPanHandled])

  // Fly to a place picked from the list. The list is the primary entry point at
  // overview zoom, where the chosen marker would otherwise sit off-screen, so we
  // recentre on its coordinates and zoom in to street level. The camera is
  // lifted upward by a slice of the viewport (one-shot `offset`, which — unlike
  // `padding` — does not persist onto later user-centring animations) so the
  // pin clears the detail sheet that slides up from the bottom.
  useEffect(() => {
    if (!mapReady || !focusTarget) return
    const map = mapRef.current
    if (!map) return
    const liftForSheet = Math.round(map.getContainer().clientHeight * 0.2)
    map.flyTo({
      center: [focusTarget[1], focusTarget[0]],
      zoom: Math.max(map.getZoom(), toMapZoom(FOCUS_ZOOM)),
      offset: [0, -liftForSheet],
      duration: 800,
    })
    onFocusHandled()
  }, [mapReady, focusTarget, onFocusHandled])

  // One-shot recenter when followUser is raised (entering navigation or the
  // recenter FAB). The bearing is folded into the same easeTo: a separate
  // bearing ease issued in the same effect flush would cancel this one at
  // frame zero (easeTo starts by stopping the in-flight animation).
  useEffect(() => {
    if (!mapReady || !followUser || !userPosition) return
    const map = mapRef.current
    if (!map) return
    map.easeTo({
      center: [userPosition[1], userPosition[0]],
      zoom: Math.max(map.getZoom(), toMapZoom(NAV_ZOOM)),
      ...(navigating && headingValid ? { bearing: userHeading! } : {}),
      duration: 500,
    })
    onFollowHandled()
  }, [mapReady, followUser, userPosition, navigating, headingValid, userHeading, onFollowHandled])

  // Heading-up navigation: the map rotates so the travel direction points up.
  // MapLibre's bearing is the compass direction that is "up", i.e. exactly
  // the GPS heading. The transition INTO navigation is handled by the follow
  // effect above (combined ease); this effect only tracks later heading
  // changes and resets north-up when navigation ends.
  const prevNavigatingRef = useRef(false)
  useEffect(() => {
    const wasNavigating = prevNavigatingRef.current
    prevNavigatingRef.current = navigating
    if (!mapReady) return
    const map = mapRef.current
    if (!map) return
    if (!navigating) {
      if (wasNavigating && map.getBearing() !== 0) {
        map.easeTo({ bearing: 0, duration: 400 })
      }
      return
    }
    if (!wasNavigating || !headingValid) return
    map.easeTo({ bearing: userHeading!, duration: 300 })
  }, [mapReady, navigating, headingValid, userHeading])

  return (
    <Map
      ref={mapRef}
      initialViewState={{
        longitude: (userPosition ?? initialCenter)[1],
        latitude:  (userPosition ?? initialCenter)[0],
        zoom: toMapZoom(DEFAULT_ZOOM),
      }}
      mapStyle={STYLE_URL[themeMode]}
      style={{ width: '100%', height: '100%' }}
      maxZoom={toMapZoom(19)}
      dragRotate={false}
      pitchWithRotate={false}
      touchPitch={false}
      cursor={correcting ? 'crosshair' : undefined}
      onLoad={handleLoad}
      onError={handleError}
      onMoveEnd={reportViewport}
      onClick={handleClick}
    >
      {userPosition && (
        <>
          <CirclesLayer
            userPosition={userPosition}
            radius={radius}
            gpsAccuracy={gpsAccuracy}
          />
          <UserMarker
            position={userPosition}
            navigating={navigating}
            heading={userHeading}
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
    </Map>
  )
})
