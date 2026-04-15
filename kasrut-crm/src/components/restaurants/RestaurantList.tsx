import type { Restaurant, Hechsher, Mashgiach, Rabbanut } from '@/types'
import { RestaurantCard } from './RestaurantCard'

interface Props {
  restaurants: Restaurant[]
  hechsherim:  Hechsher[]
  mashgichim:  Mashgiach[]
  rabbanuts:   Rabbanut[]
  canEdit:     boolean
  onDelete:    (id: string) => void
}

export function RestaurantList({ restaurants, hechsherim, mashgichim, rabbanuts, canEdit, onDelete }: Props) {
  return (
    <div className="restaurant-grid">
      {restaurants.map(r => (
        <RestaurantCard
          key={r.id}
          restaurant={r}
          hechsherim={hechsherim}
          mashgichim={mashgichim}
          rabbanuts={rabbanuts}
          canEdit={canEdit}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
