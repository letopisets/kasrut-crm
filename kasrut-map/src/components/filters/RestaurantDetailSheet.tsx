import {
  SwipeableDrawer, Box, Typography, Chip, Stack,
  Button, IconButton, Divider,
} from '@mui/material'
import CloseIcon       from '@mui/icons-material/Close'
import DirectionsIcon  from '@mui/icons-material/Directions'
import EditIcon        from '@mui/icons-material/Edit'
import PhoneIcon       from '@mui/icons-material/Phone'
import AccessTimeIcon  from '@mui/icons-material/AccessTime'
import PlaceIcon       from '@mui/icons-material/Place'
import { ReviewsPanel } from '@/components/community/ReviewsPanel'
import type { MapRestaurant, MapUser } from '@/types'
import { FOOD_TYPE_LABEL, FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI, KASHRUT_LABEL, KASHRUT_COLOR } from '@/lib/constants'

interface Props {
  restaurant:   MapRestaurant | null
  hasLocation:  boolean
  onClose:      () => void
  onStartRoute: (r: MapRestaurant) => void
  onSuggestEdit:(r: MapRestaurant) => void
  onRequireAuth:() => void
  formatDist:   (m: number) => string
  user:         MapUser | null
}

export function RestaurantDetailSheet({
  restaurant: r,
  hasLocation,
  onClose,
  onStartRoute,
  onSuggestEdit,
  onRequireAuth,
  formatDist,
  user,
}: Props) {
  return (
    <SwipeableDrawer
      anchor="bottom"
      open={!!r}
      onClose={onClose}
      onOpen={() => {}}
      disableSwipeToOpen
      PaperProps={{
        sx: {
          borderTopLeftRadius: 8,
          borderTopRightRadius: 8,
          maxHeight: '82vh',
          p: 0,
        },
      }}
    >
      {/* Puller handle */}
      <Box sx={{ display: 'flex', justifyContent: 'center', pt: 1.5, pb: 0.5 }}>
        <Box sx={{ width: 40, height: 4, borderRadius: 2, bgcolor: 'divider' }} />
      </Box>

      {r && (
        <Box sx={{ px: 2.5, pb: 3, overflowY: 'auto' }}>
          {/* Title row */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1.5 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="h6" fontWeight={700}>{r.name}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <PlaceIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{r.address}, {r.city}</Typography>
              </Box>
            </Box>
            <IconButton size="small" onClick={onClose} sx={{ mt: -0.5 }}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>

          {/* Badges */}
          <Stack direction="row" spacing={1} flexWrap="wrap" useFlexGap mb={2}>
            <Chip
              label={`${FOOD_TYPE_EMOJI[r.foodType]} ${FOOD_TYPE_LABEL[r.foodType]}`}
              size="small"
              sx={{
                bgcolor: `${FOOD_TYPE_COLOR[r.foodType]}22`,
                color:   FOOD_TYPE_COLOR[r.foodType],
                border:  `1px solid ${FOOD_TYPE_COLOR[r.foodType]}55`,
                fontWeight: 700,
              }}
            />
            <Chip
              label={KASHRUT_LABEL[r.kashrutLevel]}
              size="small"
              sx={{
                bgcolor: `${KASHRUT_COLOR[r.kashrutLevel]}22`,
                color:   KASHRUT_COLOR[r.kashrutLevel],
                border:  `1px solid ${KASHRUT_COLOR[r.kashrutLevel]}55`,
                fontWeight: 700,
              }}
            />
            {r.distance !== undefined && (
              <Chip
                label={formatDist(r.distance)}
                size="small"
                color="primary"
                variant="outlined"
                sx={{ fontWeight: 700 }}
              />
            )}
          </Stack>

          <Divider sx={{ mb: 2 }} />

          {/* Info rows */}
          <Stack spacing={1.25} mb={2.5}>
            <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
              <Typography variant="body2" color="text.secondary" minWidth={100}>Сертификат:</Typography>
              <Typography variant="body2" fontWeight={600}>{r.hechsher}</Typography>
            </Box>
            {r.phone && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <PhoneIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant="body2">{r.phone}</Typography>
              </Box>
            )}
            {r.hours && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <AccessTimeIcon sx={{ fontSize: 15, color: 'text.secondary' }} />
                <Typography variant="body2" color="text.secondary">{r.hours}</Typography>
              </Box>
            )}
          </Stack>

          {/* Route button */}
          <Button
            fullWidth
            variant="contained"
            size="large"
            startIcon={<DirectionsIcon />}
            disabled={!hasLocation}
            onClick={() => onStartRoute(r)}
            sx={{ borderRadius: 1, fontWeight: 700, py: 1.25 }}
          >
            {hasLocation ? 'Построить маршрут' : 'Включите геолокацию'}
          </Button>

          <Button
            fullWidth
            variant="outlined"
            startIcon={<EditIcon />}
            onClick={() => onSuggestEdit(r)}
            sx={{ borderRadius: 1, mt: 1 }}
          >
            Предложить правку
          </Button>

          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', mt: 1.5 }}>
            Перед заказом проверьте действующую теудат кашрут непосредственно в заведении.
          </Typography>

          <Divider sx={{ my: 2.5 }} />

          <ReviewsPanel restaurantId={r.id} user={user} onRequireAuth={onRequireAuth} />
        </Box>
      )}
    </SwipeableDrawer>
  )
}
