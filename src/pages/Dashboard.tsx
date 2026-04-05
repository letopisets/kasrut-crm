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
  const t            = useLang()
  const perm         = usePermissions()
  const scopedRests  = useRestaurants()
  const scopedInsps  = useInspections()
  const allRests     = useRestaurantStore(s => s.restaurants)
  const rabbanuts    = useRabbanutStore(s => s.rabbanuts)

  const stats = [
    { icon: '✓',  value: scopedRests.filter(r => r.status === 'ok').length,  color: STATUS_COLOR.ok,       label: t.stats[0], sub: t.statsSub[0] },
    { icon: '⏳', value: scopedRests.filter(r => r.status !== 'ok').length,  color: STATUS_COLOR.warning,  label: t.stats[1], sub: t.statsSub[1] },
    { icon: '🔍', value: scopedInsps.length,                                  color: ROLE_COLOR.rabbanut,   label: t.stats[2], sub: t.statsSub[2] },
    { icon: '📄', value: 7,                                                    color: STATUS_COLOR.critical, label: t.stats[3], sub: t.statsSub[3] },
  ]

  return (
    <div>
      {/* Page title */}
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ fontSize: 19, fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          {t.dashboard.title}
        </h2>
        <p style={{ color: 'var(--text-muted)', fontSize: 11, marginTop: 3 }}>{t.dashboard.sub}</p>
      </div>

      {/* Owner: per-rabbanut overview */}
      {perm.isOwner && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 14 }}>
          {rabbanuts.map(rb => {
            const rbRests = allRests.filter(r => r.rabbanutId === rb.id)
            const rbCrit  = rbRests.filter(r => r.status !== 'ok').length
            return (
              <div key={rb.id} style={{
                background:     'var(--bg-card)',
                border:         `1px solid ${rb.color}25`,
                borderRadius:   10,
                padding:        '12px 15px',
                display:        'flex',
                alignItems:     'center',
                justifyContent: 'space-between',
              }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>{rb.name}</div>
                  <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                    {rb.city} · {rbRests.length} est.
                  </div>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <Badge
                    label={rb.active ? t.rabbanuts.active : t.rabbanuts.inactive}
                    color={rb.active ? STATUS_COLOR.ok : '#666'}
                    small
                  />
                  {rbCrit > 0 && (
                    <div style={{ marginTop: 4 }}>
                      <Badge label={`${rbCrit} ⚠`} color={STATUS_COLOR.critical} small />
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 11, marginBottom: 20 }}>
        {stats.map((s, i) => (
          <StatCard key={i} icon={s.icon} value={s.value} label={s.label} sub={s.sub} color={s.color} />
        ))}
      </div>

      {/* Expiring + Upcoming */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <ExpiringList />
        <UpcomingInspections />
      </div>
    </div>
  )
}
