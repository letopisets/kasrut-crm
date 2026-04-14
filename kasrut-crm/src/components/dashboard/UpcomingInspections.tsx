import { useInspections } from '@/hooks/useInspections'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { TYPE_COLOR } from '@/lib/statusColor'

export function UpcomingInspections() {
  const t           = useLang()
  const inspections = useInspections()
  const restaurants = useRestaurantStore(s => s.restaurants)
  const mashgichim  = useMashgiachStore(s => s.mashgichim)

  return (
    <div className="card">
      <div className="list-widget-title" style={{ color: 'var(--role-rabbanut)' }}>{t.upcoming}</div>

      {inspections.length === 0 && <div className="list-empty">—</div>}

      {inspections.map(ins => {
        const rest      = restaurants.find(r => r.id === ins.restaurantId)
        const mashgiach = mashgichim.find(m => m.id === ins.mashgiachId)
        const dateLabel = ins.date.slice(5).replace('-', '/')

        return (
          <div key={ins.id} className="list-item">
            <div>
              <div className="list-item-name">{rest?.name ?? '—'}</div>
              <div className="list-item-sub">{mashgiach?.name ?? '—'}</div>
            </div>
            <Badge label={dateLabel} color={TYPE_COLOR[ins.type]} small />
          </div>
        )
      })}
    </div>
  )
}
