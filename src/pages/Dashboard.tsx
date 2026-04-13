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
import { STATUS_COLOR, ROLE_COLOR } from '@/lib/statusColor'

export default function Dashboard() {
  const t           = useLang()
  const perm        = usePermissions()
  const scopedRests = useRestaurants()
  const scopedInsps = useInspections()
  const allRests    = useRestaurantStore(s => s.restaurants)
  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)

  const stats = [
    { icon: '✓',  value: scopedRests.filter(r => r.status === 'ok').length,  color: STATUS_COLOR.ok,       label: t.stats[0], sub: t.statsSub[0] },
    { icon: '⏳', value: scopedRests.filter(r => r.status !== 'ok').length,  color: STATUS_COLOR.warning,  label: t.stats[1], sub: t.statsSub[1] },
    { icon: '🔍', value: scopedInsps.length,                                  color: ROLE_COLOR.rabbanut,   label: t.stats[2], sub: t.statsSub[2] },
    { icon: '📄', value: 7,                                                    color: STATUS_COLOR.critical, label: t.stats[3], sub: t.statsSub[3] },
  ]

  return (
    <div>
      <div className="dashboard-head">
        <h2 className="page-title">{t.dashboard.title}</h2>
        <p className="page-sub">{t.dashboard.sub}</p>
      </div>

      {perm.isOwner && (
        <div className="rabbanut-grid">
          {rabbanuts.map(rb => {
            const rbRests = allRests.filter(r => r.rabbanutId === rb.id)
            const rbCrit  = rbRests.filter(r => r.status !== 'ok').length
            return (
              <div
                key={rb.id}
                className="rabbanut-card"
                style={{ '--c': rb.color } as React.CSSProperties}
              >
                <div className="rabbanut-card-info">
                  <div className="rabbanut-card-name">{rb.name}</div>
                  <div className="rabbanut-card-sub">{rb.city} · {rbRests.length} est.</div>
                </div>
                <div className="rabbanut-card-right">
                  <Badge
                    label={rb.active ? t.rabbanuts.active : t.rabbanuts.inactive}
                    color={rb.active ? STATUS_COLOR.ok : '#666'}
                    small
                  />
                  {rbCrit > 0 && (
                    <div className="rabbanut-card-crit">
                      <Badge label={`${rbCrit} ⚠`} color={STATUS_COLOR.critical} small />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      <div className="stats-grid">
        {stats.map((s, i) => (
          <StatCard key={i} icon={s.icon} value={s.value} label={s.label} sub={s.sub} color={s.color} />
        ))}
      </div>

      <div className="bottom-grid">
        <ExpiringList />
        <UpcomingInspections />
      </div>
    </div>
  )
}
