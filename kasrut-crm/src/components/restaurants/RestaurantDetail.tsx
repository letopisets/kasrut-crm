import { useMemo } from 'react'
import type { Restaurant } from '@/types'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { HechsherBlock } from './HechsherBlock'
import { STATUS_COLOR, RESULT_COLOR } from '@/lib/statusColor'

interface Props { restaurant: Restaurant }

export function RestaurantDetailContent({ restaurant: r }: Props) {
  const t          = useLang()
  const perm       = usePermissions()
  const hechsherim    = useHechsherStore(s => s.hechsherim)
  const mashgichim    = useMashgiachStore(s => s.mashgichim)
  const allInspections= useInspectionStore(s => s.inspections)

  const hechsher   = hechsherim.find(h => h.id === r.hechsherId)
  const mashgiach  = mashgichim.find(m => m.id === r.mashgiachId)
  const inspections= allInspections.filter(i => i.restaurantId === r.id)

  const mashgiachById = useMemo(
    () => new Map(mashgichim.map(m => [m.id, m])),
    [mashgichim]
  )

  const infoRows = [
    [t.restaurants.cols.level,    r.level],
    [t.restaurants.cols.mashgiach,mashgiach?.name ?? '—'],
    ['Kitniyot',                  r.kitniyot],
    [t.restaurants.cols.expires,  r.expires],
  ]

  return (
    <div className="detail-grid">

      <div className="detail-col">
        <div className="card">
          <div className="detail-header">
            <div>
              <h2 className="detail-name">{r.name}</h2>
              <p className="detail-addr">{r.address}, {r.city}</p>
            </div>
            <Badge label={t.status[r.status]} color={STATUS_COLOR[r.status]} />
          </div>

          {infoRows.map(([k, v]) => (
            <div key={k} className="info-row">
              <span className="info-label">{k}</span>
              <span className="info-value">{v}</span>
            </div>
          ))}

          {r.notes && <div className="notes-block">{r.notes}</div>}
        </div>

        {hechsher && <HechsherBlock hechsher={hechsher} />}
      </div>

      <div className="detail-col">
        <div className="card">
          <div className="card-section-title" style={{ color: 'var(--role-rabbanut)' }}>
            🔍 {t.inspections.title}
          </div>

          {inspections.length === 0 && <div className="card-empty">—</div>}

          {inspections.map(ins => {
            const m = mashgiachById.get(ins.mashgiachId)
            return (
              <div key={ins.id} className="insp-item">
                <div>
                  <div className="insp-item-date">{ins.date}</div>
                  <div className="insp-item-mashgiach">{m?.name ?? '—'}</div>
                </div>
                <Badge label={t.inspections.result[ins.result]} color={RESULT_COLOR[ins.result]} small />
              </div>
            )
          })}
        </div>

        {perm.canEdit && (
          <div className="card">
            <div className="card-section-title" style={{ color: 'var(--gold)' }}>
              {t.restaurants.actions}
            </div>
            {t.restaurants.actionList.map((action, i) => (
              <button
                key={action}
                className={i === t.restaurants.actionList.length - 1 ? 'action-btn-danger' : 'action-btn'}
              >
                {action}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
