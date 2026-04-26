import { useNavigate } from 'react-router-dom'
import type { Restaurant, Hechsher, Mashgiach, Rabbanut } from '@/types'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { STATUS_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import EditIcon from '@mui/icons-material/Edit'
import CloseIcon from '@mui/icons-material/Close'

interface Props {
  restaurant: Restaurant
  hechsherim: Hechsher[]
  mashgichim: Mashgiach[]
  rabbanuts:  Rabbanut[]
  canEdit:    boolean
  onEdit:     (r: Restaurant) => void
  onDelete:   (id: string) => void
}

export function RestaurantCard({ restaurant: r, hechsherim, mashgichim, rabbanuts, canEdit, onEdit, onDelete }: Props) {
  const navigate  = useNavigate()
  const t         = useLang()
  const perm      = usePermissions()
  const hechsher  = hechsherim.find(h => h.id === r.hechsherId)
  const mashgiach = mashgichim.find(m => m.id === r.mashgiachId)
  const rabbanut  = rabbanuts.find(rb => rb.id === r.rabbanutId)
  const sc        = STATUS_COLORS[r.status]

  return (
    <Box
      onClick={() => navigate(`/restaurants/${r.id}`)}
      sx={{
        background: '#161929',
        border: `1px solid #252840`,
        borderTop: `3px solid ${sc}`,
        borderRadius: 2.5,
        p: 2.25,
        cursor: 'pointer',
        display: 'flex', flexDirection: 'column', gap: 1.5,
        boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        transition: 'all 0.2s ease',
        '&:hover': {
          background: '#1E2235',
          borderColor: '#353858',
          boxShadow: '0 4px 16px rgba(0,0,0,0.35)',
          transform: 'translateY(-2px)',
        },
      }}
    >
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 1 }}>
        <Box sx={{ flex: 1, minWidth: 0 }}>
          <Typography sx={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.name}
          </Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
            {r.address}, {r.city}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexShrink: 0 }}>
          <Badge label={t.status[r.status]} color={sc} small />
          {canEdit && (
            <>
              <Tooltip title="Edit">
                <IconButton
                  size="small"
                  onClick={e => { e.stopPropagation(); onEdit(r) }}
                  sx={{ color: '#50526A', '&:hover': { color: '#9A9AB0' } }}
                >
                  <EditIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
              <Tooltip title="Delete">
                <IconButton
                  size="small"
                  onClick={e => { e.stopPropagation(); onDelete(r.id) }}
                  sx={{ color: alpha('#E74C3C', 0.6), '&:hover': { color: '#E74C3C' } }}
                >
                  <CloseIcon sx={{ fontSize: 14 }} />
                </IconButton>
              </Tooltip>
            </>
          )}
        </Box>
      </Box>

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minHeight: 22 }}>
        {hechsher
          ? <HechsherTag hechsher={hechsher} small />
          : <Typography sx={{ fontSize: 10, color: 'text.disabled' }}>—</Typography>}
        {perm.isOwner && rabbanut && (
          <Badge label={rabbanut.city} color={rabbanut.color} small />
        )}
      </Box>

      <Box sx={{
        display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px 14px',
        pt: 1.25, borderTop: '1px solid #1C1F32',
      }}>
        <Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 500, letterSpacing: '0.3px', textTransform: 'uppercase', mb: 0.25 }}>
            {t.restaurants.cols.level}
          </Typography>
          <Typography sx={{ fontSize: 12, fontWeight: 600, color: 'text.secondary' }}>{r.level}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 500, letterSpacing: '0.3px', textTransform: 'uppercase', mb: 0.25 }}>
            {t.restaurants.cols.mashgiach}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {mashgiach?.name ?? '—'}
          </Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 10, color: 'text.secondary', fontWeight: 500, letterSpacing: '0.3px', textTransform: 'uppercase', mb: 0.25 }}>
            {t.restaurants.cols.expires}
          </Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{r.expires}</Typography>
        </Box>
      </Box>
    </Box>
  )
}
