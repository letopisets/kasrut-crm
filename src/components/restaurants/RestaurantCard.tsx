import { useNavigate } from 'react-router-dom'
import type { Restaurant } from '@/types'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useRabbanutStore } from '@/store/useRabbanutStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, HechsherTag } from '@/components/ui'
import { STATUS_COLOR } from '@/lib/statusColor'

interface Props { restaurant: Restaurant }

export function RestaurantCard({ restaurant: r }: Props) {
  const navigate  = useNavigate()
  const t         = useLang()
  const perm      = usePermissions()
  const hechsher  = useHechsherStore(s => s.hechsherim.find(h => h.id === r.hechsherId))
  const mashgiach = useMashgiachStore(s => s.mashgichim.find(m => m.id === r.mashgiachId))
  const rabbanut  = useRabbanutStore(s => s.rabbanuts.find(rb => rb.id === r.rabbanutId))

  return (
    <div
      onClick={() => navigate(`/restaurants/${r.id}`)}
      className="restaurant-card"
      style={{ '--c': STATUS_COLOR[r.status] } as React.CSSProperties}
    >
      <div className="rest-card-header">
        <div className="rest-card-name-wrap">
          <div className="rest-card-name">{r.name}</div>
          <div className="rest-card-address">{r.address}, {r.city}</div>
        </div>
        <Badge label={t.status[r.status]} color={STATUS_COLOR[r.status]} small />
      </div>

      <div className="rest-card-tags">
        {hechsher
          ? <HechsherTag hechsher={hechsher} small />
          : <span className="rest-card-no-tag">—</span>}
        {perm.isOwner && rabbanut && (
          <Badge label={rabbanut.city} color={rabbanut.color} small />
        )}
      </div>

      <div className="card-info-grid">
        <div>
          <div className="card-info-label">{t.restaurants.cols.level}</div>
          <div className="card-info-value">{r.level}</div>
        </div>
        <div>
          <div className="card-info-label">{t.restaurants.cols.mashgiach}</div>
          <div className="card-info-truncated">{mashgiach?.name ?? '—'}</div>
        </div>
        <div>
          <div className="card-info-label">{t.restaurants.cols.expires}</div>
          <div className="card-info-value" style={{ fontWeight: 400 }}>{r.expires}</div>
        </div>
      </div>
    </div>
  )
}
