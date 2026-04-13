import type { Restaurant } from '@/types'
import { RestaurantCard } from './RestaurantCard'

interface Props { restaurants: Restaurant[] }

export function RestaurantList({ restaurants }: Props) {
  return (
    <div className="restaurant-grid">
      {restaurants.map(r => (
        <RestaurantCard key={r.id} restaurant={r} />
      ))}
    </div>
  )
}
