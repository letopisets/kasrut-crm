import { useMemo } from 'react'
import { Marker } from 'react-leaflet'
import L from 'leaflet'
import type { MapRestaurant } from '@/types'
import { FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI } from '@/lib/constants'

interface Props {
  restaurant: MapRestaurant
  selected:   boolean
  onClick:    (r: MapRestaurant) => void
}

function makeIcon(foodType: MapRestaurant['foodType'], selected: boolean): L.DivIcon {
  const color = FOOD_TYPE_COLOR[foodType]
  const emoji = FOOD_TYPE_EMOJI[foodType]
  const cls   = selected ? 'km-pin km-pin--selected' : 'km-pin'

  return L.divIcon({
    className: '',
    iconSize:  [32, 32],
    iconAnchor:[16, 32],
    html: `
      <div class="${cls}" style="background:${color}">
        <span class="km-pin-emoji">${emoji}</span>
      </div>`,
  })
}

export function RestaurantMarker({ restaurant: r, selected, onClick }: Props) {
  const icon = useMemo(() => makeIcon(r.foodType, selected), [r.foodType, selected])

  return (
    <Marker
      position={[r.lat, r.lng]}
      icon={icon}
      eventHandlers={{ click: () => onClick(r) }}
      zIndexOffset={selected ? 1000 : 0}
    />
  )
}
