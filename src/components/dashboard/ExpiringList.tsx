import { useNavigate } from 'react-router-dom'
import { useRestaurants } from '@/hooks/useRestaurants'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { daysUntil } from '@/lib/daysUntil'
import { STATUS_COLOR } from '@/lib/statusColor'

export function ExpiringList() {
  const navigate    = useNavigate()
  const t           = useLang()
  const perm        = usePermissions()
  const restaurants = useRestaurants()
  const hechsherim  = useHechsherStore(s => s.hechsherim)
  const rabbanuts   = useRabbanutStore(s => s.rabbanuts)

  const expiring = restaurants.filter(r => r.status !== 'ok')

  return (
    <div className="card">
      <div className="list-widget-title" style={{ color: 'var(--gold)' }}>{t.expiring}</div>

      {expiring.length === 0 && <div className="list-empty">—</div>}

      {expiring.map(r => {
        const hechsher = hechsherim.find(h => h.id === r.hechsherId)
        const rabbanut = rabbanuts.find(rb => rb.id === r.rabbanutId)
        const days     = daysUntil(r.expires)

        return (
          <div key={r.id} className="list-item" onClick={() => navigate('/restaurants')}>
            <div>
              <div className="list-item-name">{r.name}</div>
              <div className="list-item-sub">
                {hechsher && <HechsherTag hechsher={hechsher} small />}
                {perm.isOwner && rabbanut && (
                  <Badge label={rabbanut.city} color={rabbanut.color} small />
                )}
              </div>
            </div>
            <Badge label={days <= 0 ? t.today : `${days} ${t.days}`} color={STATUS_COLOR[r.status]} />
          </div>
        )
      })}
    </div>
  )
}
