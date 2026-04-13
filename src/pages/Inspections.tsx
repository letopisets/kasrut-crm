import { useState } from 'react'
import { useInspections } from '@/hooks/useInspections'
import { usePermissions } from '@/hooks/usePermissions'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Button } from '@/components/ui'
import { InspectionList } from '@/components/inspections/InspectionList'
import { InspectionForm } from '@/components/inspections/InspectionForm'
import { ROLE_COLOR, TYPE_COLOR, RESULT_COLOR } from '@/lib/statusColor'
import type { InspectionType, InspectionResult } from '@/types'

type TypeFilter   = 'all' | InspectionType
type ResultFilter = 'all' | InspectionResult

const TYPE_FILTERS:   TypeFilter[]   = ['all', 'planned', 'urgent']
const RESULT_FILTERS: ResultFilter[] = ['all', 'pending', 'open', 'pass', 'fail']

export default function Inspections() {
  const [typeFilter,   setTypeFilter]   = useState<TypeFilter>('all')
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all')
  const [showForm,     setShowForm]     = useState(false)

  const t           = useLang()
  const perm        = usePermissions()
  const role        = useAuthStore(s => s.role)
  const rc          = ROLE_COLOR[role]
  const inspections = useInspections()

  const filtered = inspections
    .filter(i => typeFilter   === 'all' || i.type   === typeFilter)
    .filter(i => resultFilter === 'all' || i.result === resultFilter)

  const typeLabel = (key: TypeFilter): string => {
    if (key === 'all')     return t.restaurants.filters[0]
    if (key === 'planned') return t.inspections.planned
    return t.inspections.urgent
  }

  const resultLabel = (key: ResultFilter): string =>
    key === 'all' ? t.restaurants.filters[0] : t.inspections.result[key]

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="page-title">{t.inspections.title}</h2>
          <p className="page-sub">{t.inspections.sub}</p>
        </div>
        {perm.canEdit && (
          <Button onClick={() => setShowForm(true)}>{t.inspections.add}</Button>
        )}
      </div>

      <div className="filter-bar">
        <div className="filter-group">
          {TYPE_FILTERS.map(key => {
            const color  = key === 'all' ? rc : TYPE_COLOR[key]
            const active = typeFilter === key
            return (
              <button
                key={key}
                onClick={() => setTypeFilter(key)}
                className={active ? 'filter-btn filter-btn--active' : 'filter-btn'}
                style={active ? { '--c': color } as React.CSSProperties : undefined}
              >
                {typeLabel(key)}
              </button>
            )
          })}
        </div>

        <div className="divider-v" />

        <div className="filter-group">
          {RESULT_FILTERS.map(key => {
            const color  = key === 'all' ? rc : RESULT_COLOR[key]
            const active = resultFilter === key
            return (
              <button
                key={key}
                onClick={() => setResultFilter(key)}
                className={active ? 'filter-btn filter-btn--active' : 'filter-btn'}
                style={active ? { '--c': color } as React.CSSProperties : undefined}
              >
                {resultLabel(key)}
              </button>
            )
          })}
        </div>
      </div>

      {filtered.length === 0
        ? <div className="empty-state">—</div>
        : <InspectionList inspections={filtered} />
      }

      {showForm && <InspectionForm onClose={() => setShowForm(false)} />}
    </div>
  )
}
