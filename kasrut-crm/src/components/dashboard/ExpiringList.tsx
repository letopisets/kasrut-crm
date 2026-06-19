import { useNavigate } from 'react-router-dom'
import { useRestaurants } from '@/hooks/useRestaurants'
import { useGetHechsherimQuery } from '@/store/api/hechsherimApi'
import { useGetRabbanutsQuery } from '@/store/api/rabbanutApi'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { daysUntil } from '@/lib/daysUntil'
import { STATUS_COLORS } from '@/theme'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Paper from '@mui/material/Paper'

export function ExpiringList() {
  const navigate    = useNavigate()
  const t           = useLang()
  const perm        = usePermissions()
  const restaurants = useRestaurants()
  const { data: hechsherim = [] } = useGetHechsherimQuery()
  const { data: rabbanuts  = [] } = useGetRabbanutsQuery()

  const expiring = restaurants.filter(r => r.status !== 'ok')

  return (
    <Paper sx={{ p: 2.75, border: '1px solid #252840' }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, mb: 1.75, color: '#E8C96D' }}>{t.expiring}</Typography>

      {expiring.length === 0 && (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', py: 1.75 }}>—</Typography>
      )}

      {expiring.map(r => {
        const hechsher = hechsherim.find(h => h.id === r.hechsherId)
        const rabbanut = rabbanuts.find(rb => rb.id === r.rabbanutId)
        const days     = daysUntil(r.expires)

        return (
          <Box
            key={r.id}
            onClick={() => navigate('/restaurants')}
            sx={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              py: 1, borderBottom: '1px solid #1C1F32', cursor: 'pointer',
              '&:last-child': { borderBottom: 'none' },
            }}
          >
            <Box>
              <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{r.name}</Typography>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.625, mt: 0.25 }}>
                {hechsher && <HechsherTag hechsher={hechsher} small />}
                {perm.isOwner && rabbanut && (
                  <Badge label={rabbanut.city} color={rabbanut.color} small />
                )}
              </Box>
            </Box>
            <Badge
              label={days <= 0 ? t.today : `${days} ${t.days}`}
              color={STATUS_COLORS[r.status]}
            />
          </Box>
        )
      })}
    </Paper>
  )
}
