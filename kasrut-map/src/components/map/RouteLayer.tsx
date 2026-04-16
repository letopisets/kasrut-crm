import { Polyline, CircleMarker } from 'react-leaflet'
import type { RouteData } from '@/types'
import { PRIMARY } from '@/lib/constants'

interface Props {
  route:       RouteData
  destination: [number, number]
}

export function RouteLayer({ route, destination }: Props) {
  return (
    <>
      {/* Route path */}
      <Polyline
        positions={route.geometry}
        pathOptions={{ color: PRIMARY, weight: 5, opacity: 0.85, lineCap: 'round', lineJoin: 'round' }}
      />
      {/* Destination marker */}
      <CircleMarker
        center={destination}
        radius={10}
        pathOptions={{ color: PRIMARY, fillColor: PRIMARY, fillOpacity: 1, weight: 3 }}
      />
    </>
  )
}
