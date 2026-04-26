import { useMemo } from 'react'
import type { Restaurant } from '@/types'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { HechsherBlock } from './HechsherBlock'
import { STATUS_COLOR, RESULT_COLOR } from '@/lib/statusColor'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'
import Button from '@mui/material/Button'
import Grid from '@mui/material/Grid'

interface Props { restaurant: Restaurant }

export function RestaurantDetailContent({ restaurant: r }: Props) {
  const t             = useLang()
  const perm          = usePermissions()
  const hechsherim    = useHechsherStore(s => s.hechsherim)
  const mashgichim    = useMashgiachStore(s => s.mashgichim)
  const allInspections= useInspectionStore(s => s.inspections)

  const hechsher   = hechsherim.find(h => h.id === r.hechsherId)
  const mashgiach  = mashgichim.find(m => m.id === r.mashgiachId)
  const inspections= allInspections.filter(i => i.restaurantId === r.id)

  const mashgiachById = useMemo(
    () => new Map(mashgichim.map(m => [m.id, m])),
    [mashgichim]
  )

  const infoRows = [
    [t.restaurants.cols.level,     r.level],
    [t.restaurants.cols.mashgiach, mashgiach?.name ?? '—'],
    ['Kitniyot',                   r.kitniyot],
    [t.restaurants.cols.expires,   r.expires],
  ]

  return (
    <Grid container spacing={2}>
      <Grid size={{ xs: 12, md: 7 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Paper sx={{ p: 2.75 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
              <Box>
                <Typography sx={{ fontSize: 17, fontWeight: 700, letterSpacing: '-0.2px' }}>{r.name}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.375 }}>{r.address}, {r.city}</Typography>
              </Box>
              <Badge label={t.status[r.status]} color={STATUS_COLOR[r.status]} />
            </Box>
            {infoRows.map(([k, v]) => (
              <Box key={k} sx={{
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                py: 1, borderBottom: '1px solid #1C1F32', '&:last-child': { borderBottom: 'none' },
              }}>
                <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 500 }}>{k}</Typography>
                <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>{v}</Typography>
              </Box>
            ))}
            {r.notes && (
              <Box sx={{
                mt: 1.5, p: '10px 13px', background: '#1E2235', borderRadius: 0.75,
                borderLeft: '2px solid #252840',
                fontSize: 12, color: 'text.secondary', fontStyle: 'italic', lineHeight: 1.6,
              }}>
                {r.notes}
              </Box>
            )}
          </Paper>
          {hechsher && <HechsherBlock hechsher={hechsher} />}
        </Box>
      </Grid>

      <Grid size={{ xs: 12, md: 5 }}>
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.75 }}>
          <Paper sx={{ p: 2.75 }}>
            <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#3498DB', mb: 1.5 }}>
              🔍 {t.inspections.title}
            </Typography>
            {inspections.length === 0 && (
              <Typography sx={{ fontSize: 12, color: 'text.disabled' }}>—</Typography>
            )}
            {inspections.map(ins => {
              const m = mashgiachById.get(ins.mashgiachId)
              return (
                <Box key={ins.id} sx={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  py: '7px', borderBottom: '1px solid #1C1F32', '&:last-child': { borderBottom: 'none' },
                }}>
                  <Box>
                    <Typography sx={{ fontSize: 12 }}>{ins.date}</Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.125 }}>{m?.name ?? '—'}</Typography>
                  </Box>
                  <Badge label={t.inspections.result[ins.result]} color={RESULT_COLOR[ins.result]} small />
                </Box>
              )
            })}
          </Paper>

          {perm.canEdit && (
            <Paper sx={{ p: 2.75 }}>
              <Typography sx={{ fontSize: 12, fontWeight: 600, color: '#E8C96D', mb: 1.5 }}>
                {t.restaurants.actions}
              </Typography>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0.75 }}>
                {t.restaurants.actionList.map((action, i) => (
                  <Button
                    key={action}
                    fullWidth
                    size="small"
                    color={i === t.restaurants.actionList.length - 1 ? 'error' : 'inherit'}
                    variant={i === t.restaurants.actionList.length - 1 ? 'outlined' : 'text'}
                    sx={{
                      justifyContent: 'flex-start', fontSize: 12,
                      color: i === t.restaurants.actionList.length - 1 ? 'error.main' : 'text.secondary',
                    }}
                  >
                    {action}
                  </Button>
                ))}
              </Box>
            </Paper>
          )}
        </Box>
      </Grid>
    </Grid>
  )
}
