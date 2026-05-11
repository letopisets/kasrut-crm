import { memo } from 'react'
import type { Hechsher, Mashgiach } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import Collapse from '@mui/material/Collapse'
import ExpandMoreIcon from '@mui/icons-material/ExpandMore'
import ExpandLessIcon from '@mui/icons-material/ExpandLess'

interface Props {
  hechsher:   Hechsher
  stats:      { restaurants: number; mashgichim: number }
  mashgichim: Mashgiach[]
  expanded:   boolean
  canEdit:    boolean
  onToggle:   (id: string) => void
  onDelete:   (id: string) => void
}

export const HechsherCard = memo(function HechsherCard({ hechsher: h, stats, mashgichim, expanded, canEdit, onToggle, onDelete }: Props) {
  const t = useLang()

  return (
    <Box sx={{
      background: '#161929',
      border: `1px solid ${alpha(h.color, 0.18)}`,
      borderRadius: 3.5,
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      overflow: 'hidden',
      transition: 'box-shadow 0.18s',
      '&:hover': { boxShadow: '0 4px 16px rgba(0,0,0,0.35)' },
    }}>
      {/* Header */}
      <Box
        onClick={() => onToggle(h.id)}
        sx={{ px: 2.5, py: 2.25, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', cursor: 'pointer', gap: 1.25 }}
      >
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 15, fontWeight: 700 }}>{h.name}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.375 }}>{h.city}</Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Badge label={h.type} color={h.color} small />
          {expanded ? <ExpandLessIcon sx={{ fontSize: 16, color: 'text.secondary' }} /> : <ExpandMoreIcon sx={{ fontSize: 16, color: 'text.secondary' }} />}
        </Box>
      </Box>

      {/* Stats */}
      <Box sx={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '1px', background: '#1C1F32', borderTop: '1px solid #1C1F32',
      }}>
        {[
          { value: stats.restaurants, label: t.hechsherim?.restaurants ?? 'Restaurants' },
          { value: stats.mashgichim,  label: t.hechsherim?.mashgichim ?? 'Mashgichim' },
          { value: h.shortName,       label: t.hechsherim?.abbrev ?? 'Abbrev' },
        ].map(({ value, label }) => (
          <Box key={label} sx={{ background: '#161929', px: 2, py: 1.5 }}>
            <Typography sx={{ fontSize: 18, fontWeight: 800, color: h.color, lineHeight: 1 }}>{value}</Typography>
            <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25 }}>{label}</Typography>
          </Box>
        ))}
      </Box>

      {/* Expanded details */}
      <Collapse in={expanded}>
        <Box onClick={e => e.stopPropagation()} sx={{ px: 2.5, py: 2, borderTop: '1px solid #1C1F32', display: 'flex', flexDirection: 'column', gap: 1.25 }}>
          {[
            [t.hechsherim?.contact ?? 'Contact', h.contact],
            [t.hechsherim?.phone ?? 'Phone', h.phone],
            [t.hechsherim?.email ?? 'Email', h.email],
          ].map(([k, v]) => (
            <Box key={k} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', py: 0.5, borderBottom: '1px solid #1C1F32', '&:last-child': { borderBottom: 'none' } }}>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 500 }}>{k}</Typography>
              <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>{v}</Typography>
            </Box>
          ))}

          {mashgichim.length > 0 && (
            <Box sx={{ pt: 1, borderTop: '1px solid #1C1F32' }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 0.75 }}>{t.hechsherim?.mashgichimList ?? 'Mashgichim'}</Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75 }}>
                {mashgichim.map(m => (
                  <Box key={m.id} sx={{ background: '#1E2235', border: '1px solid #252840', borderRadius: '20px', px: 1.25, py: '3px' }}>
                    <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>{m.name}</Typography>
                  </Box>
                ))}
              </Box>
            </Box>
          )}

          {canEdit && (
            <Box sx={{ display: 'flex', justifyContent: 'flex-end', pt: 0.5 }}>
              <Button variant="outlined" color="error" size="small" onClick={() => onDelete(h.id)}>
                {t.hechsherim?.delete ?? 'Delete'}
              </Button>
            </Box>
          )}
        </Box>
      </Collapse>
    </Box>
  )
})
