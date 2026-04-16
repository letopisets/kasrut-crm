import {
  Drawer, Box, Typography, Divider, Stack,
  Chip, IconButton, Button, ToggleButton, ToggleButtonGroup,
} from '@mui/material'
import CloseIcon from '@mui/icons-material/Close'
import RestartAltIcon from '@mui/icons-material/RestartAlt'
import type { MapFilters, FoodType, KashrutLevel } from '@/types'
import {
  FOOD_TYPE_LABEL, FOOD_TYPE_COLOR, FOOD_TYPE_EMOJI,
  KASHRUT_LABEL, KASHRUT_COLOR,
  RADIUS_OPTIONS, CITIES,
} from '@/lib/constants'

interface Props {
  open:                boolean
  onClose:             () => void
  filters:             MapFilters
  activeFilterCount:   number
  onToggleKashrut:     (l: KashrutLevel) => void
  onToggleFoodType:    (t: FoodType) => void
  onSetCity:           (c: string) => void
  onSetRadius:         (r: number | null) => void
  onReset:             () => void
}

const FOOD_TYPES:     FoodType[]     = ['meat', 'dairy', 'pareve', 'takeaway']
const KASHRUT_LEVELS: KashrutLevel[] = ['mehadrin', 'badatz', 'regular']

export function FilterPanel({
  open, onClose, filters, activeFilterCount,
  onToggleKashrut, onToggleFoodType, onSetCity, onSetRadius, onReset,
}: Props) {
  return (
    <Drawer
      anchor="left"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 300, p: 0 } }}
    >
      {/* Header */}
      <Box sx={{ px: 2.5, py: 2, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Typography variant="h6" sx={{ color: 'primary.main' }}>
          Фильтры {activeFilterCount > 0 && `(${activeFilterCount})`}
        </Typography>
        <Box>
          {activeFilterCount > 0 && (
            <IconButton size="small" onClick={onReset} title="Сбросить всё" sx={{ mr: 0.5 }}>
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
        {/* Food type */}
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}>
          Тип кухни
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1} mb={3}>
          {FOOD_TYPES.map(t => {
            const active = filters.foodType.includes(t)
            return (
              <Chip
                key={t}
                label={`${FOOD_TYPE_EMOJI[t]} ${FOOD_TYPE_LABEL[t]}`}
                onClick={() => onToggleFoodType(t)}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  borderColor: FOOD_TYPE_COLOR[t],
                  color:       active ? '#fff' : FOOD_TYPE_COLOR[t],
                  bgcolor:     active ? FOOD_TYPE_COLOR[t] : 'transparent',
                  '&:hover':   { bgcolor: active ? FOOD_TYPE_COLOR[t] : `${FOOD_TYPE_COLOR[t]}22` },
                }}
              />
            )
          })}
        </Stack>

        {/* Kashrut level */}
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}>
          Уровень кашрута
        </Typography>
        <Stack direction="column" gap={1} mb={3}>
          {KASHRUT_LEVELS.map(l => {
            const active = filters.kashrutLevel.includes(l)
            return (
              <Chip
                key={l}
                label={KASHRUT_LABEL[l]}
                onClick={() => onToggleKashrut(l)}
                variant={active ? 'filled' : 'outlined'}
                sx={{
                  justifyContent: 'flex-start',
                  borderColor:    KASHRUT_COLOR[l],
                  color:          active ? '#fff' : KASHRUT_COLOR[l],
                  bgcolor:        active ? KASHRUT_COLOR[l] : 'transparent',
                  '&:hover':      { bgcolor: active ? KASHRUT_COLOR[l] : `${KASHRUT_COLOR[l]}22` },
                }}
              />
            )
          })}
        </Stack>

        {/* City */}
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}>
          Город
        </Typography>
        <ToggleButtonGroup
          value={filters.city}
          exclusive
          onChange={(_e, v) => { if (v) onSetCity(v) }}
          orientation="vertical"
          fullWidth
          sx={{ mb: 3 }}
        >
          {CITIES.map(c => (
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

        {/* Radius */}
        <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', letterSpacing: 1, mb: 1.5, display: 'block' }}>
          Радиус поиска
        </Typography>
        <Stack direction="row" flexWrap="wrap" gap={1}>
          {RADIUS_OPTIONS.map(o => {
            const active = filters.radius === o.value
            return (
              <Chip
                key={String(o.value)}
                label={o.label}
                onClick={() => onSetRadius(o.value)}
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
          Показать результаты
        </Button>
      </Box>
    </Drawer>
  )
}
