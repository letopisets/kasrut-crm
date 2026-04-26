import { useRestaurants } from '@/hooks/useRestaurants'
import { useInspections } from '@/hooks/useInspections'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { StatCard } from '@/components/dashboard/StatCard'
import { ExpiringList } from '@/components/dashboard/ExpiringList'
import { UpcomingInspections } from '@/components/dashboard/UpcomingInspections'
import { STATUS_COLORS, ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'

export default function Dashboard() {
  const t           = useLang()
  const perm        = usePermissions()
  const scopedRests = useRestaurants()
  const scopedInsps = useInspections()
  const allRests    = useRestaurantStore(s => s.restaurants)
  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)

  const stats = [
    { icon: '✓',  value: scopedRests.filter(r => r.status === 'ok').length,  color: STATUS_COLORS.ok,       label: t.stats[0], sub: t.statsSub[0] },
    { icon: '⏳', value: scopedRests.filter(r => r.status !== 'ok').length,  color: STATUS_COLORS.warning,  label: t.stats[1], sub: t.statsSub[1] },
    { icon: '🔍', value: scopedInsps.length,                                  color: ROLE_COLORS.rabbanut,   label: t.stats[2], sub: t.statsSub[2] },
    { icon: '📄', value: 7,                                                    color: STATUS_COLORS.critical, label: t.stats[3], sub: t.statsSub[3] },
  ]

  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
          {t.dashboard.title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>{t.dashboard.sub}</Typography>
      </Box>

      {perm.isOwner && (
        <Grid container spacing={1.5} sx={{ mb: 2 }}>
          {rabbanuts.map(rb => {
            const rbRests = allRests.filter(r => r.rabbanutId === rb.id)
            const rbCrit  = rbRests.filter(r => r.status !== 'ok').length
            return (
              <Grid key={rb.id} size={{ xs: 12, sm: 6, lg: 4 }}>
                <Box sx={{
                  background: '#161929',
                  border: `1px solid ${alpha(rb.color, 0.14)}`,
                  borderRadius: 2.5, px: 2, py: 1.75,
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
                }}>
                  <Box sx={{ flex: 1, minWidth: 0 }}>
                    <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{rb.name}</Typography>
                    <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25 }}>
                      {rb.city} · {rbRests.length} est.
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5, flexShrink: 0 }}>
                    <Badge
                      label={rb.active ? t.rabbanuts.active : t.rabbanuts.inactive}
                      color={rb.active ? STATUS_COLORS.ok : '#666'}
                      small
                    />
                    {rbCrit > 0 && <Badge label={`${rbCrit} ⚠`} color={STATUS_COLORS.critical} small />}
                  </Box>
                </Box>
              </Grid>
            )
          })}
        </Grid>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {stats.map((s, i) => (
          <Grid key={i} size={{ xs: 6, lg: 3 }}>
            <StatCard icon={s.icon} value={s.value} label={s.label} sub={s.sub} color={s.color} />
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={1.75}>
        <Grid size={{ xs: 12, md: 6 }}>
          <ExpiringList />
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <UpcomingInspections />
        </Grid>
      </Grid>
    </Box>
  )
}
