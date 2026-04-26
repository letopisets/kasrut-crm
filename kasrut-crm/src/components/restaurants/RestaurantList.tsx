import type { Restaurant, Hechsher, Mashgiach, Rabbanut } from '@/types'
import { RestaurantCard } from './RestaurantCard'
import Grid from '@mui/material/Grid'

interface Props {
  restaurants: Restaurant[]
  hechsherim:  Hechsher[]
  mashgichim:  Mashgiach[]
  rabbanuts:   Rabbanut[]
  canEdit:     boolean
  onEdit:      (r: Restaurant) => void
  onDelete:    (id: string) => void
}

export function RestaurantList({ restaurants, hechsherim, mashgichim, rabbanuts, canEdit, onEdit, onDelete }: Props) {
  return (
    <Grid container spacing={1.75}>
      {restaurants.map(r => (
        <Grid key={r.id} size={{ xs: 12, md: 6, xl: 4 }}>
          <RestaurantCard
            restaurant={r}
            hechsherim={hechsherim}
            mashgichim={mashgichim}
            rabbanuts={rabbanuts}
            canEdit={canEdit}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </Grid>
      ))}
    </Grid>
  )
}
