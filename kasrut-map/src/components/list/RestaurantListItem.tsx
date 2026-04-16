import { Card, CardContent, Box, Typography, Chip, Stack, IconButton } from '@mui/material'
import DirectionsIcon from '@mui/icons-material/Directions'
import PlaceIcon from '@mui/icons-material/Place'
import type { MapRestaurant } from '@/types'
import { FOOD_TYPE_LABEL, FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI, KASHRUT_LABEL, KASHRUT_COLOR } from '@/lib/constants'

interface Props {
  restaurant:   MapRestaurant
  onSelect:     (r: MapRestaurant) => void
  onStartRoute: (r: MapRestaurant) => void
  formatDist:   (m: number) => string
}

export function RestaurantListItem({ restaurant: r, onSelect, onStartRoute, formatDist }: Props) {
  return (
    <Card
      variant="outlined"
      sx={{ bgcolor: 'background.paper', borderColor: 'divider', borderRadius: 2 }}
    >
      <CardContent sx={{ pb: '12px !important', p: 0 }}>
        {/* Clickable area — everything except the route button */}
        <Box
          onClick={() => onSelect(r)}
          sx={{
            cursor: 'pointer', px: 2, pt: 2, pb: 0,
            '&:hover': { bgcolor: 'action.hover' },
            borderRadius: 2,
          }}
        >
          {/* Header row */}
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle1" fontWeight={700} noWrap>
                {r.name}
              </Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mt: 0.25 }}>
                <PlaceIcon sx={{ fontSize: 13, color: 'text.secondary' }} />
                <Typography variant="caption" color="text.secondary" noWrap>
                  {r.address}, {r.city}
                </Typography>
              </Box>
            </Box>
            {r.distance !== undefined && (
              <Typography variant="caption" color="primary.main" fontWeight={700} sx={{ ml: 1, flexShrink: 0 }}>
                {formatDist(r.distance)}
              </Typography>
            )}
          </Box>

          {/* Tags row */}
          <Stack direction="row" spacing={0.75} flexWrap="wrap" useFlexGap mb={1.5}>
            <Chip
              label={`${FOOD_TYPE_EMOJI[r.foodType]} ${FOOD_TYPE_LABEL[r.foodType]}`}
              size="small"
              sx={{
                bgcolor: `${FOOD_TYPE_COLOR[r.foodType]}22`,
                color:   FOOD_TYPE_COLOR[r.foodType],
                border:  `1px solid ${FOOD_TYPE_COLOR[r.foodType]}55`,
                fontWeight: 600,
              }}
            />
            <Chip
              label={KASHRUT_LABEL[r.kashrutLevel]}
              size="small"
              sx={{
                bgcolor: `${KASHRUT_COLOR[r.kashrutLevel]}22`,
                color:   KASHRUT_COLOR[r.kashrutLevel],
                border:  `1px solid ${KASHRUT_COLOR[r.kashrutLevel]}55`,
                fontWeight: 600,
              }}
            />
            <Chip label={r.hechsher} size="small" variant="outlined" sx={{ borderColor: 'divider', fontSize: '0.7rem' }} />
          </Stack>
        </Box>

        {/* Footer — outside clickable area to avoid nesting buttons */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', px: 2, pb: 1.5 }}>
          {r.hours && (
            <Typography variant="caption" color="text.secondary" noWrap sx={{ flex: 1 }}>
              🕐 {r.hours}
            </Typography>
          )}
          <IconButton
            size="small"
            color="primary"
            onClick={() => onStartRoute(r)}
            title="Построить маршрут"
            sx={{ ml: 'auto', bgcolor: 'rgba(232,165,7,0.1)', '&:hover': { bgcolor: 'rgba(232,165,7,0.2)' } }}
          >
            <DirectionsIcon fontSize="small" />
          </IconButton>
        </Box>
      </CardContent>
    </Card>
  )
}
