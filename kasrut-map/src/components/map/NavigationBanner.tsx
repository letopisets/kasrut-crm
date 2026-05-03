import { Box, Typography, IconButton, Chip } from '@mui/material'
import CloseIcon       from '@mui/icons-material/Close'
import ListAltIcon     from '@mui/icons-material/ListAlt'
import NavigationIcon  from '@mui/icons-material/Navigation'
import { useMapLang } from '@/i18n/useMapLang'
import type { RouteStep } from '@/types'

interface ActiveStepLite {
  step:           RouteStep
  distanceToStep: number
  remainingDist:  number
  remainingTime:  number
  arrived:        boolean
}

interface Props {
  active:        ActiveStepLite | null
  onShowSteps:   () => void
  onStop:        () => void
  formatDist:    (m: number) => string
  formatTime:    (s: number) => string
}

export function NavigationBanner({ active, onShowSteps, onStop, formatDist, formatTime }: Props) {
  const t = useMapLang()

  return (
    <Box
      sx={{
        position: 'absolute',
        top: 12,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1100,
        width: 'min(96vw, 460px)',
        bgcolor: 'background.paper',
        border: '1px solid',
        borderColor: 'primary.main',
        borderRadius: 2,
        px: 2,
        py: 1.25,
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
      }}
    >
      <Box sx={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 1.5 }}>
        <NavigationIcon sx={{ color: 'primary.main', fontSize: 32 }} />
        <Box sx={{ flex: 1, minWidth: 0 }}>
          {active && !active.arrived ? (
            <>
              <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                {t.inMeters.replace('{d}', formatDist(active.distanceToStep))}
              </Typography>
              <Typography variant="body1" sx={{ fontWeight: 700, lineHeight: 1.25 }} noWrap>
                {active.step.instruction}
              </Typography>
            </>
          ) : (
            <Typography variant="body1" sx={{ fontWeight: 700 }}>
              {active?.arrived ? t.arrived : t.startingNavigation}
            </Typography>
          )}
        </Box>
        <IconButton size="small" onClick={onShowSteps} title={t.showSteps}>
          <ListAltIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={onStop} title={t.endNavigation}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </Box>

      {active && !active.arrived && (
        <Box sx={{ display: 'flex', flexDirection: 'row', gap: 1, mt: 1 }}>
          <Chip label={formatDist(active.remainingDist)} size="small" color="primary" />
          <Chip
            label={formatTime(active.remainingTime)}
            size="small"
            variant="outlined"
            sx={{ borderColor: 'primary.main', color: 'primary.main' }}
          />
        </Box>
      )}
    </Box>
  )
}
