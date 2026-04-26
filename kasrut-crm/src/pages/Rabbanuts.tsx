import { useRabbanutController } from '@/controllers/useRabbanutController'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { RabbanutForm } from '@/components/rabbanuts/RabbanutForm'
import type { Rabbanut } from '@/types'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import IconButton from '@mui/material/IconButton'
import Tooltip from '@mui/material/Tooltip'
import AddIcon from '@mui/icons-material/Add'
import EditIcon from '@mui/icons-material/Edit'
import PauseIcon from '@mui/icons-material/Pause'
import PlayArrowIcon from '@mui/icons-material/PlayArrow'
import DeleteIcon from '@mui/icons-material/Delete'

export default function Rabbanuts() {
  const t    = useLang()
  const ctrl = useRabbanutController()

  const handleSave = (data: Omit<Rabbanut, 'id'>) => {
    if (ctrl.editTarget) {
      void ctrl.updateRabbanut(ctrl.editTarget.id, data)
    } else {
      void ctrl.createRabbanut(data)
    }
  }

  return (
    <Box>
      <Box sx={{
        display: 'flex', justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' },
        gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {t.rabbanuts?.title ?? 'Rabbanuts'}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {ctrl.rabbanuts.length} {t.rabbanuts?.count ?? 'organizations'}
          </Typography>
        </Box>
        <Button variant="contained" startIcon={<AddIcon />} onClick={ctrl.openForm} size="small" disableElevation>
          {t.rabbanuts?.add ?? '+ Add'}
        </Button>
      </Box>

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.rabbanuts.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {t.rabbanuts?.empty ?? 'No organizations'}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {ctrl.rabbanuts.map(r => {
            const stats = ctrl.getStats(r)
            return (
              <Box
                key={r.id}
                sx={{
                  background: '#161929',
                  border: '1px solid #252840',
                  borderLeft: `3px solid ${r.color}`,
                  borderRadius: 2.5,
                  px: 2.5, py: 2,
                  display: 'flex', alignItems: 'center',
                  gap: 2, flexWrap: { xs: 'wrap', sm: 'nowrap' },
                  transition: 'background 0.18s',
                  '&:hover': { background: '#1E2235' },
                }}
              >
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography sx={{ fontSize: 14, fontWeight: 700, lineHeight: 1.3 }}>
                    {r.name}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.25 }}>
                    {r.city} · {r.contact}
                  </Typography>
                  <Typography sx={{ fontSize: 11, color: 'text.secondary' }}>
                    {r.phone} · {r.email}
                  </Typography>
                </Box>

                <Box sx={{ display: 'flex', gap: 2.5, flexShrink: 0, alignItems: 'center' }}>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: r.color, lineHeight: 1 }}>
                      {stats.restaurants}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                      {t.rabbanuts?.restaurants ?? 'restaurants'}
                    </Typography>
                  </Box>
                  <Box sx={{ textAlign: 'center' }}>
                    <Typography sx={{ fontSize: 18, fontWeight: 800, color: r.color, lineHeight: 1 }}>
                      {stats.mashgichim}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.secondary' }}>
                      {t.rabbanuts?.mashgichim ?? 'mashgichim'}
                    </Typography>
                  </Box>
                  {stats.critical > 0 && (
                    <Badge label={`${stats.critical} critical`} color="#E74C3C" small />
                  )}
                </Box>

                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, flexShrink: 0 }}>
                  <Badge
                    label={r.active ? (t.rabbanuts?.active ?? 'Active') : (t.rabbanuts?.inactive ?? 'Inactive')}
                    color={r.active ? '#2ECC71' : '#555555'}
                    small
                  />
                  <Tooltip title="Edit">
                    <IconButton size="small" onClick={() => ctrl.openEdit(r)}
                      sx={{ color: 'text.secondary', '&:hover': { color: '#E8C96D' } }}>
                      <EditIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={r.active ? 'Deactivate' : 'Activate'}>
                    <IconButton size="small" onClick={() => ctrl.toggleRabbanut(r.id)}
                      sx={{ color: 'text.secondary', '&:hover': { color: r.active ? '#F39C12' : '#2ECC71' } }}>
                      {r.active ? <PauseIcon sx={{ fontSize: 15 }} /> : <PlayArrowIcon sx={{ fontSize: 15 }} />}
                    </IconButton>
                  </Tooltip>
                  <Tooltip title="Delete">
                    <IconButton size="small" onClick={() => ctrl.deleteRabbanut(r.id)}
                      sx={{ color: alpha('#E74C3C', 0.6), '&:hover': { color: '#E74C3C' } }}>
                      <DeleteIcon sx={{ fontSize: 15 }} />
                    </IconButton>
                  </Tooltip>
                </Box>
              </Box>
            )
          })}
        </Box>
      )}

      {ctrl.showForm && (
        <RabbanutForm
          initial={ctrl.editTarget ?? undefined}
          onSave={handleSave}
          onClose={ctrl.closeForm}
        />
      )}
    </Box>
  )
}
