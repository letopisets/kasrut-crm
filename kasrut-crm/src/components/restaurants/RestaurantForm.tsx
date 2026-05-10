import { useState } from 'react'
import { useGetHechsherimQuery, useCreateHechsherMutation } from '@/store/api/hechsherimApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { useCreateRestaurantMutation, useUpdateRestaurantMutation } from '@/store/api/restaurantsApi'
import { useAppSelector } from '@/store'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import { HechsherForm } from '@/components/hechsherim/HechsherForm'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import type { Restaurant, FoodType } from '@/types'
import type { Hechsher } from '@/types'

const CITIES = ['Jerusalem', 'Haifa', 'Tel Aviv', 'Tzfat', 'Tiberias', 'Bnei Brak', 'Other']

function extractApiError(err: unknown, fallback: string): string {
  if (typeof err === 'object' && err !== null) {
    if ('data' in err) {
      const data = (err as { data: unknown }).data
      if (typeof data === 'object' && data !== null) {
        if ('message' in data) return String((data as { message: unknown }).message)
        if ('error' in data) return String((data as { error: unknown }).error)
      }
      if (typeof data === 'string') return data
    }
    if ('message' in err) return String((err as { message: unknown }).message)
    if ('error' in err) return String((err as { error: unknown }).error)
  }
  return fallback
}

interface Props {
  initial?: Restaurant
  onClose:  () => void
}

export function RestaurantForm({ initial, onClose }: Props) {
  const t    = useLang()
  const user = useAppSelector(s => s.auth.user)
  const perm = usePermissions()

  const { data: hechsherim = [] } = useGetHechsherimQuery()
  const { data: mashgichim = [] } = useGetMashgichimQuery()
  const { data: rabbanuts  = [] } = useGetRabbanutsQuery()
  const [createMutation, { isLoading: creating }] = useCreateRestaurantMutation()
  const [updateMutation, { isLoading: updating }] = useUpdateRestaurantMutation()
  const [createHechsher, { isLoading: creatingHechsher }] = useCreateHechsherMutation()

  const isEdit    = !!initial
  const isLoading = creating || updating

  const [submitted, setSubmitted] = useState(false)
  const [showAddHechsher, setShowAddHechsher] = useState(false)
  const [addHechsherError, setAddHechsherError] = useState<string | null>(null)

  const FOOD_TYPES: FoodType[] = ['meat', 'dairy', 'pareve', 'takeaway']

  const [form, setForm] = useState({
    name:        initial?.name        ?? '',
    address:     initial?.address     ?? '',
    city:        initial?.city        ?? '',
    level:       (initial?.level      ?? '') as '' | 'Regular' | 'Mehadrin',
    hechsherId:  initial?.hechsherId  ?? '',
    mashgiachId: initial?.mashgiachId ?? '',
    kitniyot:    (initial?.kitniyot   ?? '') as '' | 'ללא חשש קטניות' | 'מכיל קטניות',
    foodType:    (initial?.foodType   ?? '') as '' | FoodType,
    expires:     initial?.expires     ?? '',
    notes:       initial?.notes       ?? '',
    rabbanutId:  initial?.rabbanutId  ?? user?.rabbanutId ?? '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const canSave = !!(form.name && form.expires && form.level && form.hechsherId && form.rabbanutId)

  const handleSave = async () => {
    setSubmitted(true)
    if (!canSave) return
    const payload = {
      name:        form.name,
      address:     form.address,
      city:        form.city,
      level:       form.level as 'Regular' | 'Mehadrin',
      hechsherId:  form.hechsherId,
      mashgiachId: form.mashgiachId || undefined,
      kitniyot:    form.kitniyot || 'ללא חשש קטניות',
      foodType:    (form.foodType || 'pareve') as FoodType,
      expires:     form.expires,
      notes:       form.notes,
      rabbanutId:  form.rabbanutId,
    }
    if (isEdit) {
      await updateMutation({ id: initial!.id, patch: payload }).unwrap()
    } else {
      await createMutation(payload).unwrap()
    }
    onClose()
  }

  const handleAddHechsher = async (data: Omit<Hechsher, 'id'>) => {
    try {
      setAddHechsherError(null)
      const h = await createHechsher(data).unwrap()
      set('hechsherId', h.id)
      setShowAddHechsher(false)
    } catch (err) {
      setAddHechsherError(extractApiError(
        err,
        'Не удалось добавить кашрут. Проверьте данные и попробуйте ещё раз.',
      ))
    }
  }

  const filteredHechsherim = perm.isOwner
    ? hechsherim.filter(h => !form.rabbanutId || h.rabbanutId === form.rabbanutId)
    : hechsherim
  const filteredMashgichim = perm.isOwner
    ? mashgichim.filter(m => !form.rabbanutId || m.rabbanutId === form.rabbanutId)
    : mashgichim.filter(m => m.active)

  const hechsherOptions  = filteredHechsherim.map(h => ({ value: h.id, label: h.name }))
  const mashgiachOptions = filteredMashgichim.map(m => ({ value: m.id, label: m.name }))
  const rabbanutOptions  = rabbanuts.map(r => ({ value: r.id, label: r.name }))

  const title = isEdit ? 'Edit Restaurant' : t.addRest.title

  return (
    <>
      <Modal title={title} onClose={onClose}>
        {perm.isOwner && (
          <Input
            label={t.nav.rabbanuts ?? 'Rabbanut'}
            value={form.rabbanutId}
            onChange={v => { set('rabbanutId', v); set('hechsherId', ''); set('mashgiachId', '') }}
            options={rabbanutOptions}
            required
            error={submitted && !form.rabbanutId}
            helperText={submitted && !form.rabbanutId ? t.validation.required : undefined}
          />
        )}
        <Input
          label={t.addRest.name}
          value={form.name}
          onChange={v => set('name', v)}
          required
          error={submitted && !form.name}
          helperText={submitted && !form.name ? t.validation.required : undefined}
        />
        <Input label={t.addRest.address}   value={form.address}     onChange={v => set('address', v)} />
        <Input label={t.addRest.city}      value={form.city}        onChange={v => set('city', v)} options={CITIES} />
        <Input
          label={t.addRest.level}
          value={form.level}
          onChange={v => set('level', v as typeof form['level'])}
          options={['Regular', 'Mehadrin']}
          required
          error={submitted && !form.level}
          helperText={submitted && !form.level ? t.validation.required : undefined}
        />
        <Input
          label={t.addRest.foodType ?? 'Тип кухни'}
          value={form.foodType}
          onChange={v => set('foodType', v as typeof form['foodType'])}
          options={FOOD_TYPES.map(ft => ({ value: ft, label: t.addRest.foodTypeLabels?.[ft] ?? ft }))}
        />

        <Box sx={{ display: 'flex', alignItems: 'flex-start', gap: 1 }}>
          <Box sx={{ flex: 1 }}>
            <Input
              label={t.addRest.hechsher}
              value={form.hechsherId}
              onChange={v => set('hechsherId', v)}
              options={hechsherOptions}
              required
              error={submitted && !form.hechsherId}
              helperText={submitted && !form.hechsherId ? t.validation.required : undefined}
            />
          </Box>
          <Button
            size="small"
            variant="outlined"
            onClick={() => { setAddHechsherError(null); setShowAddHechsher(true) }}
            sx={{ mt: 0.25, whiteSpace: 'nowrap', minWidth: 'auto', fontSize: '0.75rem' }}
          >
            + {t.hechsherim?.addTitle ?? 'Добавить кашрут'}
          </Button>
        </Box>

        <Input label={t.addRest.mashgiach} value={form.mashgiachId} onChange={v => set('mashgiachId', v)} options={mashgiachOptions} />
        <Input label={t.addRest.kitniyot}  value={form.kitniyot}    onChange={v => set('kitniyot', v as typeof form['kitniyot'])} options={['ללא חשש קטניות', 'מכיל קטניות']} />
        <Input
          label={t.addRest.expires}
          value={form.expires}
          onChange={v => set('expires', v)}
          type="date"
          required
          error={submitted && !form.expires}
          helperText={submitted && !form.expires ? t.validation.required : undefined}
        />
        <Input label={t.addRest.notes}     value={form.notes}       onChange={v => set('notes', v)} placeholder="..." />

        <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
          <Button
            variant="contained"
            onClick={() => void handleSave()}
            disabled={isLoading}
            disableElevation
          >
            {isLoading ? <CircularProgress size={16} color="inherit" /> : t.addRest.save}
          </Button>
          <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
            {t.addRest.cancel}
          </Button>
        </Box>
      </Modal>

      {showAddHechsher && (
        <HechsherForm
          rabbanutOptions={rabbanutOptions}
          onSave={handleAddHechsher}
          onClose={() => { setAddHechsherError(null); setShowAddHechsher(false) }}
          error={addHechsherError}
          saving={creatingHechsher}
        />
      )}
    </>
  )
}
