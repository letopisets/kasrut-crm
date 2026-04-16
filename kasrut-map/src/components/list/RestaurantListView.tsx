import { Box, Typography, Stack } from '@mui/material'
import StorefrontIcon from '@mui/icons-material/Storefront'
import type { MapRestaurant } from '@/types'
import { RestaurantListItem } from './RestaurantListItem'

interface Props {
  restaurants:  MapRestaurant[]
  onSelect:     (r: MapRestaurant) => void
  onStartRoute: (r: MapRestaurant) => void
  formatDist:   (m: number) => string
}

export function RestaurantListView({ restaurants, onSelect, onStartRoute, formatDist }: Props) {
  if (restaurants.length === 0) {
    return (
      <Box sx={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 2, color: 'text.secondary', p: 4 }}>
        <StorefrontIcon sx={{ fontSize: 56, opacity: 0.3 }} />
        <Typography variant="body1">Заведения не найдены</Typography>
        <Typography variant="body2" textAlign="center">
          Попробуйте изменить фильтры или расширить радиус поиска
        </Typography>
      </Box>
    )
  }

  return (
    <Box sx={{ flex: 1, overflowY: 'auto', p: 2 }}>
      <Typography variant="body2" color="text.secondary" mb={2}>
        Найдено: <strong style={{ color: '#E8A507' }}>{restaurants.length}</strong> заведений
      </Typography>
      <Stack spacing={1.5}>
        {restaurants.map(r => (
          <RestaurantListItem
            key={r.id}
            restaurant={r}
            onSelect={onSelect}
            onStartRoute={onStartRoute}
            formatDist={formatDist}
          />
        ))}
      </Stack>
    </Box>
  )
}
