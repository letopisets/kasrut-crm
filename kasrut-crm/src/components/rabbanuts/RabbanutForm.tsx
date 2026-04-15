import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input, Button } from '@/components/ui'
import type { Rabbanut } from '@/types'

const PALETTE = ['#E8C96D', '#E67E22', '#1ABC9C', '#8E44AD', '#3498DB', '#2ECC71', '#E74C3C', '#95A5A6']

interface Props {
  initial?: Rabbanut
  onSave:  (data: Omit<Rabbanut, 'id'>) => void
  onClose: () => void
}

export function RabbanutForm({ initial, onSave, onClose }: Props) {
  const t = useLang()

  const [form, setForm] = useState({
    name:    initial?.name    ?? '',
    city:    initial?.city    ?? '',
    contact: initial?.contact ?? '',
    phone:   initial?.phone   ?? '',
    email:   initial?.email   ?? '',
    color:   initial?.color   ?? PALETTE[0],
    active:  initial?.active  ?? true,
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.city) return
    onSave(form)
  }

  const isEdit = !!initial

  return (
    <Modal
      title={isEdit
        ? (t.rabbanuts?.title ?? 'Rabbanut')
        : (t.rabbanuts?.add ?? '+ Add Rabbanut')}
      onClose={onClose}
    >
      <Input label={t.rabbanuts?.name    ?? 'Name'}    value={form.name}    onChange={v => set('name', v)} />
      <Input label={t.rabbanuts?.city    ?? 'City'}    value={form.city}    onChange={v => set('city', v)} />
      <Input label={t.rabbanuts?.contact ?? 'Contact'} value={form.contact} onChange={v => set('contact', v)} />
      <Input label={t.rabbanuts?.phone   ?? 'Phone'}   value={form.phone}   onChange={v => set('phone', v)} />
      <Input label={t.rabbanuts?.email   ?? 'Email'}   value={form.email}   onChange={v => set('email', v)} />

      <div className="input-group">
        <label className="input-label">Color</label>
        <div className="color-palette">
          {PALETTE.map(c => (
            <button
              key={c}
              type="button"
              className={`color-swatch${form.color === c ? ' color-swatch--active' : ''}`}
              style={{ background: c }}
              onClick={() => set('color', c)}
            />
          ))}
        </div>
      </div>

      <div className="form-actions">
        <Button onClick={handleSave} disabled={!form.name || !form.city}>
          {t.rabbanuts?.save ?? 'Save'}
        </Button>
        <Button variant="secondary" onClick={onClose}>
          {t.rabbanuts?.cancel ?? 'Cancel'}
        </Button>
      </div>
    </Modal>
  )
}
