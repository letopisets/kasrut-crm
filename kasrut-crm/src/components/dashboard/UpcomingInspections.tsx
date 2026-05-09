import { useInspections } from '@/hooks/useInspections'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery } from '@/store/api/mashgichimApi'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { TYPE_COLORS } from '@/theme'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'

export function UpcomingInspections() {
  const t           = useLang()
  const inspections = useInspections()
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()

  return (
    <Paper sx={{ p: 2.75, border: '1px solid #252840' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1.75, color: '#3498DB' }}>{t.upcoming}</Typography>

      {inspections.length === 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', py: 1.75 }}>—</Typography>
      )}

      {inspections.map(ins => {
        const rest      = restaurants.find(r => r.id === ins.restaurantId)
        const mashgiach = mashgichim.find(m => m.id === ins.mashgiachId)
        const dateLabel = ins.date.slice(5).replace('-', '/')

        return (
          <Box
            key={ins.id}
            sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              py: 1, borderBottom: '1px solid #1C1F32',
              '&:last-child': { borderBottom: 'none' },
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{rest?.name ?? '—'}</Typography>
              <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25 }}>{mashgiach?.name ?? '—'}</Typography>
            </Box>
            <Badge label={dateLabel} color={TYPE_COLORS[ins.type]} small />
          </Box>
        )
      })}
    </Paper>
  )
}
