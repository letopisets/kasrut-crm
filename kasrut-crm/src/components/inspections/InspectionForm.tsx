import { useState } from 'react'
import { useGetRestaurantsQuery }    from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }     from '@/store/api/mashgichimApi'
import { useCreateInspectionMutation } from '@/store/api/inspectionsApi'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Modal, Input, Button } from '@/components/ui'
import type { InspectionType } from '@/types'

interface Props { onClose: () => void }

export function InspectionForm({ onClose }: Props) {
  const t    = useLang()
  const user = useAuthStore(s => s.user)

  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()
  const [createMutation, { isLoading }] = useCreateInspectionMutation()

  const [restaurantId, setRestaurantId] = useState('')
  const [date,         setDate]         = useState('')
  const [type,         setType]         = useState<InspectionType>('planned')
  const [mashgiachId,  setMashgiachId]  = useState(
    user?.role === 'mashgiach' ? user.id : ''
  )
  const [notes, setNotes] = useState('')

  const canSave = !!(restaurantId && date && mashgiachId)

  const handleSave = async () => {
    if (!canSave) return
    await createMutation({ restaurantId, mashgiachId, date, type, notes }).unwrap()
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
      <Input label={t.inspections.date}       value={date}         onChange={setDate}         type="date" />
      <Input label={t.inspections.type}       value={type}         onChange={v => setType(v as InspectionType)} options={typeOptions} />
      {user?.role !== 'mashgiach' && (
        <Input label={t.inspections.assign} value={mashgiachId} onChange={setMashgiachId} options={mashOptions} />
      )}
      <Input label={t.inspections.notes} value={notes} onChange={setNotes} />

      <div className="form-actions">
        <Button onClick={() => void handleSave()} disabled={!canSave || isLoading}>
          {isLoading ? '…' : t.inspections.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>{t.inspections.cancel}</Button>
      </div>
    </Modal>
  )
}
