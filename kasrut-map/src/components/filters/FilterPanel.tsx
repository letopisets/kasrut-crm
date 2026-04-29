import {
  Drawer, Box, Typography, Divider, Stack,
  Chip, IconButton, Button, ToggleButton, ToggleButtonGroup,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { MapFilters, FoodType } from '@/types'
import {
  FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI,
  RADIUS_VALUES,
} from '@/lib/constants'
import { useMapLang } from '@/i18n/useMapLang'

interface Props {
  open:                boolean
  onClose:             () => void
  filters:             MapFilters
  activeFilterCount:   number
  availableHechshers:  string[]
  availableCities:     string[]
  onToggleHechsher:    (h: string) => void
  onToggleFoodType:    (t: FoodType) => void
  onSetCity:           (c: string) => void
  onSetRadius:         (r: number | null) => void
  onReset:             () => void
}

const FOOD_TYPES: FoodType[] = ['meat', 'dairy', 'pareve', 'takeaway']

export function FilterPanel({
  open, onClose, filters, activeFilterCount,
  availableHechshers, availableCities,
  onToggleHechsher, onToggleFoodType, onSetCity, onSetRadius, onReset,
}: Props) {
  const t = useMapLang()

  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 300, p: 0 } }}
    >
      <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ color: 'primary.main' }}>
          {t.filterTitle} {activeFilterCount > 0 && `(${activeFilterCount})`}
        </Typography>
        <Box>
          {activeFilterCount > 0 && (
            <IconButton size="small" onClick={onReset} title={t.resetAll} sx={{ mr: 0.5 }}>
              <RestartAltIcon fontSize="small" />
            </IconButton>
          )}
          <IconButton size="small" onClick={onClose}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>
      <Divider />

      <Box sx={{ px: 2.5, py: 2, overflowY: 'auto', flex: 1 }}>
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0, mb: 1.5, display: 'block' }}>
          {t.foodTypeSection}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1} mb={3}>
          {FOOD_TYPES.map(foodType => {
            const active = filters.foodType.includes(foodType)
            return (
              <Chip
                key={foodType}
                label={`${FOOD_TYPE_EMOJI[foodType]} ${t.foodType[foodType]}`}
                onClick={() => onToggleFoodType(foodType)}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  borderColor: FOOD_TYPE_COLOR[foodType],
                  color:       active ? '#fff' : FOOD_TYPE_COLOR[foodType],
                  bgcolor:     active ? FOOD_TYPE_COLOR[foodType] : 'transparent',
                  '&:hover':   { bgcolor: active ? FOOD_TYPE_COLOR[foodType] : `${FOOD_TYPE_COLOR[foodType]}22` },
                }}
              />
            )
          })}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0, mb: 1.5, display: 'block' }}>
          {t.hechsherSection}
        </Typography>
        <Stack direction="column" gap={1} mb={3} sx={{ maxHeight: 260, overflowY: 'auto', pr: 0.5 }}>
          {availableHechshers.map(h => {
            const active = filters.hechsher.includes(h)
            return (
              <Chip
                key={h}
                label={h}
                onClick={() => onToggleHechsher(h)}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  justifyContent: 'flex-start',
                  borderColor:    active ? 'primary.main' : 'divider',
                  color:          active ? 'primary.contrastText' : 'text.primary',
                  bgcolor:        active ? 'primary.main' : 'transparent',
                  '&:hover':      { bgcolor: active ? 'primary.dark' : 'action.hover' },
                }}
              />
            )
          })}
        </Stack>

        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0, mb: 1.5, display: 'block' }}>
          {t.citySection}
        </Typography>
        <ToggleButtonGroup
          value={filters.city}
          exclusive
          onChange={(_e, v) => { if (v) onSetCity(v) }}
          orientation="vertical"
          fullWidth
          sx={{ mb: 3 }}
        >
          {availableCities.map(c => (
            <ToggleButton
              key={c} value={c}
              sx={{
                justifyContent: 'flex-start', py: 0.75, textTransform: 'none',
                '&.Mui-selected': { color: 'primary.main', borderColor: 'primary.main', bgcolor: 'rgba(232,165,7,0.1)' },
              }}
            >
              {c}
            </ToggleButton>
          ))}
        </ToggleButtonGroup>

        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 0, mb: 1.5, display: 'block' }}>
          {t.radiusSection}
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {RADIUS_VALUES.map((value, index) => {
            const active = filters.radius === value
            return (
              <Chip
                key={String(value)}
                label={t.radiusLabels[index]}
                onClick={() => onSetRadius(value)}
                variant={active ? 'filled' : 'outlined'}
                color={active ? 'primary' : 'default'}
                sx={{ borderColor: active ? 'primary.main' : 'divider' }}
              />
            )
          })}
        </Stack>
      </Box>

      <Divider />
      <Box sx={{ p: 2 }}>
        <Button fullWidth variant="contained" onClick={onClose}>
          {t.showResults}
        </Button>
      </Box>
    </Drawer>
  )
}
