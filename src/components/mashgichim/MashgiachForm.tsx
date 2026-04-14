import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Modal, Input, Button } from '@/components/ui'
import type { Mashgiach } from '@/types'

interface SelectOption { value: string; label: string }
type MashgiachInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

interface Props {
  hechsherOptions: SelectOption[]
  onSave: (data: MashgiachInput) => void
  onClose: () => void
}

export function MashgiachForm({ hechsherOptions, onSave, onClose }: Props) {
  const t    = useLang()
  const user = useAuthStore(s => s.user)

  const [form, setForm] = useState({
    name: '', phone: '', email: '', area: '',
    hechsherimIds: [] as string[],
    active:    true,
    rabbanutId: user?.rabbanutId ?? 'rb1',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.phone) return
    onSave(form)
  }

  return (
    <Modal title={t.mashgichim?.addTitle ?? 'Add Mashgiach'} onClose={onClose}>
      <Input label={t.mashgichim?.name  ?? 'Name'}  value={form.name}  onChange={v => set('name', v)} />
      <Input label={t.mashgichim?.phone ?? 'Phone'} value={form.phone} onChange={v => set('phone', v)} />
      <Input label={t.mashgichim?.email ?? 'Email'} value={form.email} onChange={v => set('email', v)} />
      <Input label={t.mashgichim?.area  ?? 'Area'}  value={form.area}  onChange={v => set('area', v)} />
      <Input
        label={t.mashgichim?.hechsher ?? 'Hechsher'}
        value={form.hechsherimIds[0] ?? ''}
        onChange={v => set('hechsherimIds', v ? [v] : [])}
        options={hechsherOptions}
      />
      <div className="form-actions">
        <Button onClick={handleSave} disabled={!form.name || !form.phone}>
          {t.addRest?.save ?? 'Save'}
        </Button>
        <Button variant="secondary" onClick={onClose}>{t.addRest?.cancel ?? 'Cancel'}</Button>
      </div>
    </Modal>
  )
}
