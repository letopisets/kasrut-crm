import {
  Drawer, Box, Typography, IconButton,
  List, ListItem, ListItemText, Divider, Chip, LinearProgress,
} from '@mui/material'
import CloseIcon      from '@mui/icons-material/Close'
import NavigationIcon from '@mui/icons-material/Navigation'
import { useMapLang } from '@/i18n/useMapLang'
import type { MapRestaurant, RouteData } from '@/types'

interface Props {
  open:         boolean
  destination:  MapRestaurant | null
  route:        RouteData | null
  loading:      boolean
  error:        string | null
  onClose:      () => void
  formatDist:   (m: number) => string
  formatTime:   (s: number) => string
}

const STEP_ICON: Record<string, string> = {
  depart:      '🚶',
  arrive:      '📍',
  turn:        '↪️',
  roundabout:  '🔄',
  rotary:      '🔄',
  merge:       '↗️',
  continue:    '⬆️',
}

export function RoutePanel({ open, destination, route, loading, error, onClose, formatDist, formatTime }: Props) {
  const t = useMapLang()

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      variant="persistent"
      slotProps={{
        paper: {
          sx: {
            width: 320,
            top: 64,
            height: 'calc(100% - 64px)',
            borderLeft: '1px solid',
            borderColor: 'divider',
          },
        }
      }}
    >
      {/* Header */}
      <Box sx={{ px: 2, py: 1.5, display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid', borderColor: 'divider' }}>
        <NavigationIcon sx={{ color: 'primary.main' }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography variant="subtitle2" noWrap sx={{ fontWeight: 700 }}>
            {destination?.name ?? t.routeTitle}
          </Typography>
          <Typography variant="caption" color="text.secondary" noWrap>
            {destination?.address}
          </Typography>
        </Box>
        <IconButton size="small" onClick={onClose}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>
      {loading && <LinearProgress color="primary" />}
      {error && (
        <Box sx={{ p: 2 }}>
          <Typography variant="body2" color="error">{error}</Typography>
        </Box>
      )}
      {route && (
        <>
          {/* Summary */}
          <Box sx={{ px: 2, py: 1.5, display: 'flex', gap: 2, bgcolor: 'rgba(232,165,7,0.08)' }}>
            <Chip label={formatDist(route.totalDistance)} color="primary" size="small" />
            <Chip label={formatTime(route.totalDuration)} variant="outlined" size="small" sx={{ borderColor: 'primary.main', color: 'primary.main' }} />
          </Box>

          <Divider />

          {/* Steps */}
          <Box sx={{ overflowY: 'auto', flex: 1 }}>
            <List dense disablePadding>
              {route.steps.map((step, i) => (
                <ListItem
                  key={i}
                  divider={i < route.steps.length - 1}
                  sx={{ px: 2, py: 1, alignItems: 'flex-start', gap: 1 }}
                >
                  <Typography sx={{ fontSize: 18, lineHeight: 1, mt: 0.25, minWidth: 24, textAlign: 'center' }}>
                    {STEP_ICON[step.instruction.startsWith('Начните') || step.instruction.startsWith('Start') || step.instruction.startsWith('התחל') ? 'depart'
                      : step.instruction.startsWith('Вы') || step.instruction.startsWith('You') || step.instruction.startsWith('הגעת') ? 'arrive'
                      : 'turn'] ?? '⬆️'}
                  </Typography>
                  <ListItemText
                    disableTypography
                    primary={
                      <Typography variant="body2" sx={{ fontWeight: i === 0 || i === route.steps.length - 1 ? 600 : 400 }}>
                        {step.instruction}
                      </Typography>
                    }
                    secondary={step.distance > 0 ? (
                      <Typography variant="caption" color="text.disabled">{formatDist(step.distance)}</Typography>
                    ) : undefined}
                  />
                </ListItem>
              ))}
            </List>
          </Box>
        </>
      )}
    </Drawer>
  );
}
