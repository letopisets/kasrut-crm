import { useState } from 'react'
import { useGetHechsherimQuery }  from '@/store/api/hechsherimApi'
import { useGetMashgichimQuery }  from '@/store/api/mashgichimApi'
import { useGetRabbanutsQuery }   from '@/store/api/rabbanutApi'
import { useCreateRestaurantMutation, useUpdateRestaurantMutation } from '@/store/api/restaurantsApi'
import { useAuthStore }  from '@/store/useAuthStore'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Modal, Input, Button } from '@/components/ui'
import type { Restaurant } from '@/types'

const CITIES = ['Jerusalem', 'Haifa', 'Tel Aviv', 'Tzfat', 'Tiberias', 'Bnei Brak', 'Other']

interface Props {
  initial?: Restaurant
  onClose:  () => void
}

export function RestaurantForm({ initial, onClose }: Props) {
  const t    = useLang()
  const user = useAuthStore(s => s.user)
  const perm = usePermissions()

  const { data: hechsherim = [] } = useGetHechsherimQuery()
  const { data: mashgichim = [] } = useGetMashgichimQuery()
  const { data: rabbanuts  = [] } = useGetRabbanutsQuery()
  const [createMutation, { isLoading: creating }] = useCreateRestaurantMutation()
  const [updateMutation, { isLoading: updating }] = useUpdateRestaurantMutation()

  const isEdit   = !!initial
  const isLoading = creating || updating

  const [form, setForm] = useState({
    name:        initial?.name        ?? '',
    address:     initial?.address     ?? '',
    city:        initial?.city        ?? '',
    level:       (initial?.level      ?? '') as '' | 'Regular' | 'Mehadrin',
    hechsherId:  initial?.hechsherId  ?? '',
    mashgiachId: initial?.mashgiachId ?? '',
    kitniyot:    (initial?.kitniyot   ?? '') as '' | 'ללא חשש קטניות' | 'מכיל קטניות',
    expires:     initial?.expires     ?? '',
    notes:       initial?.notes       ?? '',
    rabbanutId:  initial?.rabbanutId  ?? user?.rabbanutId ?? '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const canSave = !!(form.name && form.expires && form.level && form.hechsherId && form.rabbanutId)

  const handleSave = async () => {
    if (!canSave) return
    const payload = {
      name:        form.name,
      address:     form.address,
      city:        form.city,
      level:       form.level as 'Regular' | 'Mehadrin',
      hechsherId:  form.hechsherId,
      mashgiachId: form.mashgiachId,
      kitniyot:    form.kitniyot || 'ללא חשש קטניות',
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

  // Filter hechsherim/mashgichim by selected rabbanutId
  const filteredHechsherim = perm.isOwner
    ? hechsherim.filter(h => !form.rabbanutId || h.rabbanutId === form.rabbanutId)
    : hechsherim
  const filteredMashgichim = perm.isOwner
    ? mashgichim.filter(m => !form.rabbanutId || m.rabbanutId === form.rabbanutId)
    : mashgichim.filter(m => m.active)

  const hechsherOptions  = filteredHechsherim.map(h => ({ value: h.id, label: h.name }))
  const mashgiachOptions = filteredMashgichim.map(m => ({ value: m.id, label: m.name }))
  const rabbanutOptions  = rabbanuts.map(r => ({ value: r.id, label: r.name }))

  const title = isEdit ? (t.addRest?.editTitle ?? 'Edit Restaurant') : t.addRest.title

  return (
    <Modal title={title} onClose={onClose}>
      {perm.isOwner && (
        <Input
          label={t.nav.rabbanuts ?? 'Rabbanut'}
          value={form.rabbanutId}
          onChange={v => { set('rabbanutId', v); set('hechsherId', ''); set('mashgiachId', '') }}
          options={rabbanutOptions}
        />
      )}
      <Input label={t.addRest.name}      value={form.name}        onChange={v => set('name', v)} />
      <Input label={t.addRest.address}   value={form.address}     onChange={v => set('address', v)} />
      <Input label={t.addRest.city}      value={form.city}        onChange={v => set('city', v)} options={CITIES} />
      <Input label={t.addRest.level}     value={form.level}       onChange={v => set('level', v as typeof form['level'])} options={['Regular', 'Mehadrin']} />
      <Input label={t.addRest.hechsher}  value={form.hechsherId}  onChange={v => set('hechsherId', v)} options={hechsherOptions} />
      <Input label={t.addRest.mashgiach} value={form.mashgiachId} onChange={v => set('mashgiachId', v)} options={mashgiachOptions} />
      <Input label={t.addRest.kitniyot}  value={form.kitniyot}    onChange={v => set('kitniyot', v as typeof form['kitniyot'])} options={['ללא חשש קטניות', 'מכיל קטניות']} />
      <Input label={t.addRest.expires}   value={form.expires}     onChange={v => set('expires', v)} type="date" />
      <Input label={t.addRest.notes}     value={form.notes}       onChange={v => set('notes', v)} placeholder="..." />

      <div className="form-actions">
        <Button onClick={() => void handleSave()} disabled={!canSave || isLoading}>
          {isLoading ? '…' : t.addRest.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>{t.addRest.cancel}</Button>
      </div>
    </Modal>
  )
}
