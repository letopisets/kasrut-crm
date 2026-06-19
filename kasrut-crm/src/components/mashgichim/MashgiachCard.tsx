import { memo } from 'react'
import type { Mashgiach, Hechsher } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import EditIcon from '@mui/icons-material/Edit'
import CloseIcon from '@mui/icons-material/Close'
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord'
import RadioButtonUncheckedIcon from '@mui/icons-material/RadioButtonUnchecked'

interface Props {
  mashgiach:  Mashgiach
  hechsherim: Hechsher[]
  canEdit:    boolean
  onToggle:   (id: string) => void
  onDelete:   (id: string) => void
  onEdit:     (m: Mashgiach) => void
}

export const MashgiachCard = memo(function MashgiachCard({ mashgiach: m, hechsherim, canEdit, onToggle, onDelete, onEdit }: Props) {
  const t  = useLang()
  const tc = m.active ? '#2ECC71' : '#50526A'

  return (
    <Box sx={{
      background: '#161929',
      border: '1px solid #252840',
      borderTop: `3px solid ${tc}`,
      borderRadius: 2.5, p: 2.25,
      display: 'flex', flexDirection: 'column', gap: 1.5,
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      transition: 'background 0.18s',
      '&:hover': { background: '#1E2235' },
    }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box>
          <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{m.name}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>{m.area}</Typography>
        </Box>
        {canEdit && (
          <Box sx={{ display: 'flex', gap: 0.5, flexShrink: 0 }}>
            <Tooltip title={m.active ? 'Deactivate' : 'Activate'}>
              <IconButton size="small" onClick={() => onToggle(m.id)} sx={{ color: tc }}>
                {m.active
                  ? <FiberManualRecordIcon sx={{ fontSize: 14 }} />
                  : <RadioButtonUncheckedIcon sx={{ fontSize: 14 }} />}
              </IconButton>
            </Tooltip>
            <Tooltip title="Edit">
              <IconButton size="small" onClick={() => onEdit(m)} sx={{ color: '#50526A', '&:hover': { color: '#9A9AB0' } }}>
                <EditIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
            <Tooltip title="Delete">
              <IconButton size="small" onClick={() => onDelete(m.id)} sx={{ color: alpha('#E74C3C', 0.6), '&:hover': { color: '#E74C3C' } }}>
                <CloseIcon sx={{ fontSize: 14 }} />
              </IconButton>
            </Tooltip>
          </Box>
        )}
      </Box>

      <Box sx={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 1 }}>
        {[
          [t.mashgichim?.phone ?? 'Phone', m.phone],
          [t.mashgichim?.email ?? 'Email', m.email],
          [t.mashgichim?.assigned ?? 'Assigned', String(m.assignedRestaurantIds.length)],
        ].map(([label, value]) => (
          <Box key={label}>
            <Typography sx={{ fontSize: 9, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.4px', mb: 0.25 }}>
              {label}
            </Typography>
            <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>{value}</Typography>
          </Box>
        ))}
      </Box>

      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, pt: 1.25, borderTop: '1px solid #1C1F32' }}>
        {hechsherim.length > 0
          ? hechsherim.map(h => <Badge key={h.id} label={h.shortName} color={h.color} small />)
          : <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>{t.mashgichim?.noHechsher ?? '—'}</Typography>
        }
      </Box>

      {!m.active && (
        <Badge label={t.mashgichim?.inactive ?? 'Inactive'} color="#50526A" small />
      )}
    </Box>
  )
})
