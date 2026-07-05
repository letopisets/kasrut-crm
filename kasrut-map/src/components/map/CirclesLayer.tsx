import { useMemo } from 'react'
import { Layer, Source } from 'react-map-gl/maplibre'
import { PRIMARY } from '@/lib/constants'

/**
 * Builds a circle of `radiusM` metres around [lat, lng] as a GeoJSON polygon.
 * MapLibre circle layers are sized in screen pixels, so metre-true circles
 * (filter radius, GPS accuracy) have to be drawn as polygons.
 */
function circlePolygon(
  [lat, lng]: [number, number],
  radiusM: number,
  points = 64,
): GeoJSON.Feature<GeoJSON.Polygon> {
  const degLat = radiusM / 111_320
  const degLng = radiusM / (111_320 * Math.max(Math.cos(lat * Math.PI / 180), 0.01))
  const ring: [number, number][] = []
  for (let i = 0; i <= points; i += 1) {
    const a = (i / points) * 2 * Math.PI
    ring.push([lng + degLng * Math.cos(a), lat + degLat * Math.sin(a)])
  }
  return { type: 'Feature', properties: {}, geometry: { type: 'Polygon', coordinates: [ring] } }
}

interface Props {
  userPosition: [number, number]
  /** Filter radius in metres (gold dashed ring), null = no radius filter. */
  radius:      number | null
  /** GPS accuracy in metres (blue halo) — only drawn when imprecise (>50 m). */
  gpsAccuracy: number | null
}

export function CirclesLayer({ userPosition, radius, gpsAccuracy }: Props) {
  const radiusGeo = useMemo(
    () => radius ? circlePolygon(userPosition, radius) : null,
    [userPosition, radius],
  )
  const accuracyGeo = useMemo(
    () => gpsAccuracy && gpsAccuracy > 50 ? circlePolygon(userPosition, gpsAccuracy) : null,
    [userPosition, gpsAccuracy],
  )

  return (
    <>
      {radiusGeo && (
        <Source id="km-radius" type="geojson" data={radiusGeo}>
          <Layer
            id="km-radius-fill"
            type="fill"
            paint={{ 'fill-color': PRIMARY, 'fill-opacity': 0.06 }}
          />
          <Layer
            id="km-radius-line"
            type="line"
            paint={{
              'line-color': PRIMARY,
              'line-width': 1.5,
              'line-dasharray': [4, 2.5],
            }}
          />
        </Source>
      )}
      {accuracyGeo && (
        <Source id="km-accuracy" type="geojson" data={accuracyGeo}>
          <Layer
            id="km-accuracy-fill"
            type="fill"
            paint={{ 'fill-color': '#4A90D9', 'fill-opacity': 0.12 }}
          />
          <Layer
            id="km-accuracy-line"
            type="line"
            paint={{ 'line-color': '#4A90D9', 'line-width': 1 }}
          />
        </Source>
      )}
    </>
  )
}
