import type { ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRestaurants } from '@/hooks/useRestaurants'
import { useInspections } from '@/hooks/useInspections'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { useHechsherStore } from '@/store/useHechsherStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { StatCard } from '@/components/dashboard/StatCard'
import { STATUS_COLORS, ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Grid from '@mui/material/Grid'
import ButtonBase from '@mui/material/ButtonBase'
import AccountBalanceIcon from '@mui/icons-material/AccountBalance'
import CheckCircleIcon from '@mui/icons-material/CheckCircle'
import TroubleshootIcon from '@mui/icons-material/Troubleshoot'

function isThisWeek(date: string): boolean {
  const d = new Date(date)
  if (Number.isNaN(d.getTime())) return false
  const now = new Date()
  const start = new Date(now)
  start.setHours(0, 0, 0, 0)
  const end = new Date(start)
  end.setDate(start.getDate() + 7)
  return d >= start && d < end
}

export default function Dashboard() {
  const navigate    = useNavigate()
  const t           = useLang()
  const perm        = usePermissions()
  const scopedRests = useRestaurants()
  const scopedInsps = useInspections()
  const allRests    = useRestaurantStore(s => s.restaurants)
  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)
  const hechsherim  = useHechsherStore(s => s.hechsherim)

  const activeCount   = scopedRests.filter(r => r.status === 'ok').length
  const warningCount  = scopedRests.filter(r => r.status === 'warning').length
  const criticalCount = scopedRests.filter(r => r.status === 'critical').length
  const weekInsps     = scopedInsps.filter(i => isThisWeek(i.date)).length

  const stats = [
    { icon: '✓',  value: activeCount,   color: STATUS_COLORS.ok,       label: t.stats[0], sub: t.statsSub[0], to: '/restaurants?status=ok' },
    { icon: '⏳', value: warningCount,  color: STATUS_COLORS.warning,  label: t.stats[1], sub: t.statsSub[1], to: '/restaurants?status=warning' },
    { icon: '!',  value: criticalCount, color: STATUS_COLORS.critical, label: t.status.critical, sub: t.restaurants.filters[3], to: '/restaurants?status=critical' },
    { icon: '🔍', value: weekInsps,     color: ROLE_COLORS.rabbanut,   label: t.stats[2], sub: t.inspections.sub, to: '/inspections?range=week' },
  ]

  const activeRabbanuts = rabbanuts.filter(rb => rb.active).length
  const rabbanutsWithIssues = rabbanuts.filter(rb =>
    allRests.some(r => r.rabbanutId === rb.id && r.status !== 'ok')
  ).length

  const OverviewCard = ({ icon, title, value, sub, color, to, children }: {
    icon: ReactNode
    title: string
    value: string
    sub: string
    color: string
    to: string
    children?: ReactNode
  }) => (
    <ButtonBase
      onClick={() => navigate(to)}
      sx={{
        width: '100%',
        height: '100%',
        textAlign: 'left',
        justifyContent: 'stretch',
        borderRadius: 3,
        '&:hover .overview-card': { transform: 'translateY(-2px)', borderColor: alpha(color, 0.34) },
      }}
    >
      <Box className="overview-card" sx={{
        width: '100%',
        height: '100%',
        background: '#161929',
        border: `1px solid ${alpha(color, 0.16)}`,
        borderRadius: 3,
        p: 2.25,
        display: 'flex',
        flexDirection: 'column',
        gap: 1.25,
        transition: 'transform 0.15s, border-color 0.15s',
      }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <Box sx={{ color, display: 'flex' }}>{icon}</Box>
          <Typography sx={{ fontSize: 14, fontWeight: 800 }}>{title}</Typography>
        </Box>
        <Box>
          <Typography sx={{ fontSize: 24, fontWeight: 900, color, lineHeight: 1 }}>{value}</Typography>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.5 }}>{sub}</Typography>
        </Box>
        {children}
      </Box>
    </ButtonBase>
  )

  return (
    <Box>
      <Box sx={{ mb: 2.5 }}>
        <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
          {t.dashboard.title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>{t.dashboard.sub}</Typography>
      </Box>

      {perm.isOwner && (
        <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
          <Grid size={{ xs: 12, md: 4 }}>
            <OverviewCard
              icon={<AccountBalanceIcon fontSize="small" />}
              title={t.nav.rabbanuts}
              value={`${activeRabbanuts}/${rabbanuts.length}`}
              sub={`${allRests.length} ${t.rabbanuts.restaurants ?? 'est.'}`}
              color={ROLE_COLORS.owner}
              to="/rabbanuts"
            >
              <Box sx={{ display: 'flex', gap: 0.75, flexWrap: 'wrap' }}>
                <Badge label={t.rabbanuts.active} color={STATUS_COLORS.ok} small />
                {rabbanutsWithIssues > 0 && <Badge label={`${rabbanutsWithIssues} ${t.status.warning}`} color={STATUS_COLORS.warning} small />}
              </Box>
            </OverviewCard>
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <OverviewCard
              icon={<CheckCircleIcon fontSize="small" />}
              title={t.nav.hechsherim}
              value={String(hechsherim.length)}
              sub={t.hechsherim.sub}
              color={ROLE_COLORS.rabbanut}
              to="/hechsherim"
            />
          </Grid>
          <Grid size={{ xs: 12, md: 4 }}>
            <OverviewCard
              icon={<TroubleshootIcon fontSize="small" />}
              title={t.nav.logs}
              value="24h"
              sub={t.logs?.sub ?? 'Service health'}
              color={STATUS_COLORS.critical}
              to="/logs"
            />
          </Grid>
        </Grid>
      )}

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {stats.map((s, i) => (
          <Grid key={i} size={{ xs: 6, lg: 3 }}>
            <StatCard icon={s.icon} value={s.value} label={s.label} sub={s.sub} color={s.color} onClick={() => navigate(s.to)} />
          </Grid>
        ))}
      </Grid>
    </Box>
  )
}
