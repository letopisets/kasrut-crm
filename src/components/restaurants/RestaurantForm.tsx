import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useRestaurantStore } from '@/store/useRestaurantStore'
import { useHechsherStore } from '@/store/useHechsherStore'
import { useMashgiachStore } from '@/store/useMashgiachStore'
import { useLang } from '@/i18n/useLang'
import { Modal, Input, Button } from '@/components/ui'

interface Props { onClose: () => void }

const CITIES = ['Jerusalem', 'Haifa', 'Tel Aviv', 'Tzfat', 'Tiberias', 'Bnei Brak']

export function RestaurantForm({ onClose }: Props) {
  const t          = useLang()
  const user       = useAuthStore(s => s.user)
  const addRest    = useRestaurantStore(s => s.add)
  const hechsherim = useHechsherStore(s => s.hechsherim)
  const mashgichim = useMashgiachStore(s => s.mashgichim)

  const [form, setForm] = useState({
    name: '', address: '', city: '', level: '' as '' | 'Regular' | 'Mehadrin',
    hechsherId: '', mashgiachId: '',
    kitniyot: '' as '' | 'ללא חשש קטניות' | 'מכיל קטניות',
    expires: '', notes: '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.expires || !form.level || !form.hechsherId) return
    addRest({
      ...form,
      level:      form.level,
      kitniyot:   form.kitniyot || 'ללא חשש קטניות',
      rabbanutId: user?.rabbanutId ?? 'rb1',
    })
    onClose()
  }

  const hechsherOptions = hechsherim.map(h => ({ value: h.id, label: h.name }))
  const mashgiachOptions = mashgichim
    .filter(m => m.active)
    .map(m => ({ value: m.id, label: m.name }))

  return (
    <Modal title={t.addRest.title} onClose={onClose}>
      <Input label={t.addRest.name}     value={form.name}       onChange={v => set('name', v)} />
      <Input label={t.addRest.address}  value={form.address}    onChange={v => set('address', v)} />
      <Input label={t.addRest.city}     value={form.city}       onChange={v => set('city', v)}
             options={CITIES} />
      <Input label={t.addRest.level}    value={form.level}      onChange={v => set('level', v as typeof form['level'])}
             options={['Regular', 'Mehadrin']} />
      <Input label={t.addRest.hechsher} value={form.hechsherId} onChange={v => set('hechsherId', v)}
             options={hechsherOptions} />
      <Input label={t.addRest.mashgiach}value={form.mashgiachId}onChange={v => set('mashgiachId', v)}
             options={mashgiachOptions} />
      <Input label={t.addRest.kitniyot} value={form.kitniyot}   onChange={v => set('kitniyot', v as typeof form['kitniyot'])}
             options={['ללא חשש קטניות', 'מכיל קטניות']} />
      <Input label={t.addRest.expires}  value={form.expires}    onChange={v => set('expires', v)}
             type="date" />
      <Input label={t.addRest.notes}    value={form.notes}      onChange={v => set('notes', v)}
             placeholder="..." />

      <div style={{ display: 'flex', gap: 7, marginTop: 4 }}>
        <Button onClick={handleSave} disabled={!form.name || !form.expires || !form.level || !form.hechsherId}>
          {t.addRest.save}
        </Button>
        <Button variant="secondary" onClick={onClose}>{t.addRest.cancel}</Button>
      </div>
    </Modal>
  )
}
