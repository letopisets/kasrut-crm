import { useMemo } from 'react'
import type { Inspection, InspectionResult } from '@/types'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, Select } from '@/components/ui'
import { TYPE_COLOR, RESULT_COLOR } from '@/lib/statusColor'

export { RESULT_COLOR } from '@/lib/statusColor'

interface Props { inspection: Inspection }

export function InspectionRow({ inspection: ins }: Props) {
  const t          = useLang()
  const perm       = usePermissions()
  const setResult  = useInspectionStore(s => s.setResult)
  const restaurant = useRestaurantStore(s => s.restaurants.find(r => r.id === ins.restaurantId))
  const mashgiach  = useMashgiachStore(s => s.mashgichim.find(m => m.id === ins.mashgiachId))

  const resultOptions = useMemo(() =>
    (['pending', 'open', 'pass', 'fail'] as InspectionResult[]).map(r => ({
      value: r, label: t.inspections.result[r],
    }))
  , [t])

  return (
    <div
      className={perm.canEdit ? 'inspection-row inspection-row--edit' : 'inspection-row inspection-row--view'}
      style={{ '--c': TYPE_COLOR[ins.type] } as React.CSSProperties}
    >
      <div>
        <div className="insp-main-name">{restaurant?.name ?? '—'}</div>
        <div className="insp-main-city">{restaurant?.city}</div>
        {ins.notes && <div className="insp-main-note">{ins.notes}</div>}
      </div>

      <div className="insp-meta">
        <div className="insp-meta-label">{t.inspections.assign}</div>
        <div className="insp-meta-value">{mashgiach?.name ?? '—'}</div>
      </div>

      <div className="insp-meta">
        <div className="insp-meta-label">{t.inspections.date}</div>
        <div className="insp-meta-value">{ins.date}</div>
      </div>

      <Badge
        label={ins.type === 'urgent' ? t.inspections.urgent : t.inspections.planned}
        color={TYPE_COLOR[ins.type]}
        small
      />

      {perm.canEdit ? (
        <Select
          value={ins.result}
          onChange={v => setResult(ins.id, v as InspectionResult)}
          options={resultOptions}
          color={RESULT_COLOR[ins.result]}
        />
      ) : (
        <Badge label={t.inspections.result[ins.result]} color={RESULT_COLOR[ins.result]} small />
      )}
    </div>
  )
}
