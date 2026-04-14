import { useState } from 'react'
import { useRestaurants } from '@/hooks/useRestaurants'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { RestaurantList } from '@/components/restaurants/RestaurantList'
import { RestaurantForm } from '@/components/restaurants/RestaurantForm'
import { ROLE_COLOR } from '@/lib/statusColor'
import type { CertStatus } from '@/types'

type Filter = 'all' | CertStatus

const FILTER_KEYS: Filter[] = ['all', 'ok', 'warning', 'critical']

export default function Restaurants() {
  const [filter,   setFilter]   = useState<Filter>('all')
  const [showForm, setShowForm] = useState(false)

  const t           = useLang()
  const perm        = usePermissions()
  const role        = useAuthStore(s => s.role)
  const rc          = ROLE_COLOR[role]
  const restaurants = useRestaurants()

  const filtered = filter === 'all'
    ? restaurants
    : restaurants.filter(r => r.status === filter)

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{t.restaurants.title}</h2>
          <p className="page-sub">{t.restaurants.sub}</p>
        </div>

        <div className="page-actions">
          <div className="filter-group">
            {FILTER_KEYS.map((key, i) => (
              <button
                key={key}
                onClick={() => setFilter(key)}
                className={filter === key ? 'filter-btn filter-btn--active' : 'filter-btn'}
                style={filter === key ? { '--c': rc } as React.CSSProperties : undefined}
              >
                {t.restaurants.filters[i]}
              </button>
            ))}
          </div>

          {perm.canEdit && (
            <Button onClick={() => setShowForm(true)}>{t.restaurants.add}</Button>
          )}
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty-state">—</div>
        : <RestaurantList restaurants={filtered} />
      }

      {showForm && <RestaurantForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
