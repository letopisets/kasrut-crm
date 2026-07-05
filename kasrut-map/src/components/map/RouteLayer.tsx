import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import type { RouteData } from '@/types'
import { PRIMARY } from '@/lib/constants'

interface Props {
  route:       RouteData
  destination: [number, number]
}

export function RouteLayer({ route, destination }: Props) {
  const line = useMemo<GeoJSON.Feature<GeoJSON.LineString>>(() => ({
    type: 'Feature',
    properties: {},
    geometry: {
      type: 'LineString',
      // RouteData stores [lat, lng]; GeoJSON wants [lng, lat].
      coordinates: route.geometry.map(([lat, lng]) => [lng, lat]),
    },
  }), [route.geometry])

  const dest = useMemo<GeoJSON.Feature<GeoJSON.Point>>(() => ({
    type: 'Feature',
    properties: {},
    geometry: { type: 'Point', coordinates: [destination[1], destination[0]] },
  }), [destination])

  return (
    <>
      {/* Route path */}
      <Source id="km-route" type="geojson" data={line}>
        <Layer
          id="km-route-line"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': PRIMARY, 'line-width': 5, 'line-opacity': 0.85 }}
        />
      </Source>
      {/* Destination marker */}
      <Source id="km-route-dest" type="geojson" data={dest}>
        <Layer
          id="km-route-dest-dot"
          type="circle"
          paint={{
            'circle-radius': 10,
            'circle-color': PRIMARY,
            'circle-stroke-color': PRIMARY,
            'circle-stroke-width': 3,
          }}
        />
      </Source>
    </>
  )
}
