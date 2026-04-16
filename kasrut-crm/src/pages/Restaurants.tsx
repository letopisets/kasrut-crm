import { useRestaurantsController } from '@/controllers/useRestaurantsController'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { RestaurantList } from '@/components/restaurants/RestaurantList'
import { RestaurantForm } from '@/components/restaurants/RestaurantForm'
import { STATUS_COLOR } from '@/lib/statusColor'
import type { CertStatus } from '@/types'

type Filter = 'all' | CertStatus
const FILTER_KEYS: Filter[] = ['all', 'ok', 'warning', 'critical']

export default function Restaurants() {
  const t    = useLang()
  const ctrl = useRestaurantsController()
  const rc   = STATUS_COLOR[ctrl.statusFilter !== 'all' ? ctrl.statusFilter : 'ok']

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
                onClick={() => ctrl.setStatusFilter(key)}
                className={ctrl.statusFilter === key ? 'filter-btn filter-btn--active' : 'filter-btn'}
                style={ctrl.statusFilter === key ? { '--c': rc } as React.CSSProperties : undefined}
              >
                {t.restaurants.filters[i]}
              </button>
            ))}
          </div>
          {ctrl.canEdit && (
            <Button onClick={ctrl.openForm}>{t.restaurants.add}</Button>
          )}
        </div>
      </div>

      {ctrl.isLoading ? (
        <div className="empty-state">Loading…</div>
      ) : ctrl.restaurants.length === 0 ? (
        <div className="empty-state">—</div>
      ) : (
        <RestaurantList
          restaurants={ctrl.restaurants}
          hechsherim={ctrl.hechsherim}
          mashgichim={ctrl.mashgichim}
          rabbanuts={ctrl.rabbanuts}
          canEdit={ctrl.canEdit}
          onEdit={ctrl.openEdit}
          onDelete={ctrl.deleteRestaurant}
        />
      )}

      {ctrl.showForm   && <RestaurantForm onClose={ctrl.closeForm} />}
      {ctrl.editTarget && <RestaurantForm initial={ctrl.editTarget} onClose={ctrl.closeEdit} />}
    </div>
  )
}
