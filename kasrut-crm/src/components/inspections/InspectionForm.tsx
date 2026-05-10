import { useState } from 'react'
import { useGetRestaurantsQuery }      from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery }       from '@/store/api/mashgichimApi'
import { useCreateInspectionMutation } from '@/store/api/inspectionsApi'
import { useAppSelector } from '@/store'
import { useLang }       from '@/i18n/useLang'
import { Modal, Input }  from '@/components/ui'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import type { InspectionType } from '@/types'

interface Props { onClose: () => void }

export function InspectionForm({ onClose }: Props) {
  const t    = useLang()
  const user = useAppSelector(s => s.auth.user)

  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()
  const [createMutation, { isLoading }] = useCreateInspectionMutation()

  const [restaurantId, setRestaurantId] = useState('')
  const [date,         setDate]         = useState('')
  const [type,         setType]         = useState<InspectionType>('planned')
  const [mashgiachId,  setMashgiachId]  = useState(user?.role === 'mashgiach' ? user.id : '')
  const [notes,        setNotes]        = useState('')
  const [submitted,    setSubmitted]    = useState(false)

  const canSave = !!(restaurantId && date && mashgiachId)

  const handleSave = async () => {
    setSubmitted(true)
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
      <Input
        label={t.inspections.restaurant}
        value={restaurantId}
        onChange={setRestaurantId}
        options={restOptions}
        required
        error={submitted && !restaurantId}
        helperText={submitted && !restaurantId ? t.validation.required : undefined}
      />
      <Input
        label={t.inspections.date}
        value={date}
        onChange={setDate}
        type="date"
        required
        error={submitted && !date}
        helperText={submitted && !date ? t.validation.required : undefined}
      />
      <Input label={t.inspections.type}       value={type}         onChange={v => setType(v as InspectionType)} options={typeOptions} />
      {user?.role !== 'mashgiach' && (
        <Input
          label={t.inspections.assign}
          value={mashgiachId}
          onChange={setMashgiachId}
          options={mashOptions}
          required
          error={submitted && !mashgiachId}
          helperText={submitted && !mashgiachId ? t.validation.required : undefined}
        />
      )}
      <Input label={t.inspections.notes} value={notes} onChange={setNotes} />

      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={() => void handleSave()} disabled={isLoading} disableElevation>
          {isLoading ? <CircularProgress size={16} color="inherit" /> : t.inspections.save}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.inspections.cancel}
        </Button>
      </Box>
    </Modal>
  )
}
