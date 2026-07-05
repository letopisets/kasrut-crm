import { memo, useCallback } from 'react'
import { Marker } from 'react-map-gl/maplibre'
import type { MarkerEvent } from 'react-map-gl/maplibre'
import type { MapRestaurant } from '@/types'
import { FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI } from '@/lib/constants'

interface Props {
  restaurant: MapRestaurant
  selected:   boolean
  onClick:    (r: MapRestaurant) => void
}

function RestaurantMarkerComponent({ restaurant: r, selected, onClick }: Props) {
  const handleClick = useCallback((e: MarkerEvent<MouseEvent>) => {
    // Marker clicks bubble into the map's own click handler — without this,
    // a tap in correction mode would both select the restaurant and apply
    // its location as the user's corrected position.
    e.originalEvent.stopPropagation()
    onClick(r)
  }, [onClick, r])

  return (
    <Marker
      longitude={r.lng}
      latitude={r.lat}
      anchor="bottom"
      onClick={handleClick}
      style={selected ? { zIndex: 2 } : undefined}
    >
      <div
        className={selected ? 'km-pin km-pin--selected' : 'km-pin'}
        style={{ background: FOOD_TYPE_COLOR[r.foodType] }}
      >
        <span className="km-pin-emoji">{FOOD_TYPE_EMOJI[r.foodType]}</span>
      </div>
    </Marker>
  )
}

export const RestaurantMarker = memo(RestaurantMarkerComponent)
