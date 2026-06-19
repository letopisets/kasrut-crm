import { useParams, useNavigate } from 'react-router-dom'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useLang } from '@/i18n/useLang'
import { RestaurantDetailContent } from '@/components/restaurants/RestaurantDetail'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'

export default function RestaurantDetail() {
  const { id }   = useParams()
  const navigate = useNavigate()
  const t        = useLang()
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const restaurant = restaurants.find(r => r.id === id)

  if (!restaurant) {
    return (
      <Box sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
        — <Button size="small" onClick={() => navigate('/restaurants')} sx={{ color: 'text.secondary' }}>{t.back}</Button>
      </Box>
    )
  }

  return (
    <Box>
      <Button
        startIcon={<ArrowBackIcon />}
        onClick={() => navigate('/restaurants')}
        size="small"
        sx={{ color: 'text.secondary', mb: 2 }}
      >
        {t.back}
      </Button>
      <RestaurantDetailContent restaurant={restaurant} />
    </Box>
  )
}
