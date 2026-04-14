import { useState } from 'react'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useInspectionStore } from '@/store/useInspectionStore'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { InspectionType } from '@/types'

interface Props { onClose: () => void }

export function InspectionForm({ onClose }: Props) {
  const t           = useLang()
  const user        = useAuthStore(s => s.user)
  const add         = useInspectionStore(s => s.add)
  const restaurants = useRestaurantStore(s => s.restaurants)
  const mashgichim  = useMashgiachStore(s => s.mashgichim)

  const [restaurantId, setRestaurantId] = useState('')
  const [date,         setDate]         = useState('')
  const [type,         setType]         = useState<InspectionType>('planned')
  const [mashgiachId,  setMashgiachId]  = useState(user?.role === 'mashgiach' ? user.id : '')
  const [notes,        setNotes]        = useState('')

  const canSave = !!(restaurantId && date && mashgiachId)

  const handleSave = () => {
    if (!canSave) return
    add({ restaurantId, mashgiachId, date, type, notes })
    onClose()
  }

  const restOptions = restaurants.map(r => ({ value: r.id, label: r.name }))
  const mashOptions = mashgichim.map(m => ({ value: m.id, label: m.name }))
  const typeOptions = [
    { value: 'planned', label: t.inspections.planned },
    { value: 'urgent',  label: t.inspections.urgent  },
  ]

  return (
    <Modal title={t.inspections.addTitle} onClose={onClose}>
      <Input label={t.inspections.restaurant} value={restaurantId} onChange={setRestaurantId} options={restOptions} />
      <Input label={t.inspections.date}        value={date}         onChange={setDate}         type="date" />
      <Input label={t.inspections.type}        value={type}         onChange={v => setType(v as InspectionType)} options={typeOptions} />
      {user?.role !== 'mashgiach' && (
        <Input label={t.inspections.assign} value={mashgiachId} onChange={setMashgiachId} options={mashOptions} />
      )}
      <Input label={t.inspections.notes} value={notes} onChange={setNotes} />

      <div className="form-actions">
        <button onClick={onClose} className="btn-cancel">{t.inspections.cancel}</button>
        <button onClick={handleSave} disabled={!canSave} className="btn-save">
          {t.inspections.save}
        </button>
      </div>
    </Modal>
  )
}
