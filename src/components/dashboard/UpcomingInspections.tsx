import { useInspections } from '@/hooks/useInspections'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'

export function UpcomingInspections() {
  const t           = useLang()
  const inspections = useInspections()
  const restaurants = useRestaurantStore(s => s.restaurants)
  const mashgichim  = useMashgiachStore(s => s.mashgichim)

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 12, padding: 20 }}>
      <div style={{ fontSize: 11, fontWeight: 600, color: '#3498DB', marginBottom: 12 }}>
        {t.upcoming}
      </div>

      {inspections.length === 0 && (
        <div style={{ fontSize: 11, color: 'var(--text-disabled)', padding: '12px 0' }}>—</div>
      )}

      {inspections.map(ins => {
        const rest     = restaurants.find(r => r.id === ins.restaurantId)
        const mashgiach= mashgichim.find(m => m.id === ins.mashgiachId)
        const typeColor= ins.type === 'urgent' ? '#E74C3C' : '#3498DB'
        const dateLabel= ins.date.slice(5).replace('-', '/')

        return (
          <div
            key={ins.id}
            style={{
              display:        'flex',
              justifyContent: 'space-between',
              alignItems:     'center',
              padding:        '7px 0',
              borderBottom:   '1px solid var(--border-subtle)',
            }}
          >
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>
                {rest?.name ?? '—'}
              </div>
              <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 1 }}>
                {mashgiach?.name ?? '—'}
              </div>
            </div>
            <Badge label={dateLabel} color={typeColor} small />
          </div>
        )
      })}
    </div>
  )
}
