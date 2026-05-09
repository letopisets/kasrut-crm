import { useState } from 'react'
import { useAppSelector } from '@/store'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import Alert from '@mui/material/Alert'
import CircularProgress from '@mui/material/CircularProgress'
import type { Hechsher, HechsherType } from '@/types'

const HECHSHER_TYPES: HechsherType[] = ['Rabbanut', 'Badatz', 'Mehadrin', 'Private']

interface SelectOption { value: string; label: string }

interface Props {
  rabbanutOptions: SelectOption[]
  onSave:  (data: Omit<Hechsher, 'id'>) => void | Promise<void>
  onClose: () => void
  error?:   string | null
  saving?:  boolean
}

export function HechsherForm({ rabbanutOptions, onSave, onClose, error, saving = false }: Props) {
  const t    = useLang()
  const user = useAppSelector(s => s.auth.user)

  const [form, setForm] = useState({
    name: '', shortName: '', city: '', contact: '', phone: '', email: '',
    type: '' as '' | HechsherType,
    color: '#3498DB',
    rabbanutId: user?.rabbanutId ?? (rabbanutOptions[0]?.value ?? ''),
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const handleSave = () => {
    if (!form.name || !form.shortName || !form.type) return
    void onSave({ ...form, type: form.type as HechsherType })
  }

  const typeOptions = HECHSHER_TYPES.map(t => ({ value: t, label: t }))

  return (
    <Modal title={t.hechsherim?.addTitle ?? 'Add Hechsher'} onClose={onClose}>
      <Input label={t.hechsherim?.name      ?? 'Name'}       value={form.name}      onChange={v => set('name', v)} />
      <Input label={t.hechsherim?.shortName ?? 'Short name'} value={form.shortName} onChange={v => set('shortName', v)} />
      <Input label={t.hechsherim?.city      ?? 'City'}       value={form.city}      onChange={v => set('city', v)} />
      <Input label={t.hechsherim?.contact   ?? 'Contact'}    value={form.contact}   onChange={v => set('contact', v)} />
      <Input label={t.hechsherim?.phone     ?? 'Phone'}      value={form.phone}     onChange={v => set('phone', v)} />
      <Input label={t.hechsherim?.email     ?? 'Email'}      value={form.email}     onChange={v => set('email', v)} />
      <Input label={t.hechsherim?.type ?? 'Type'} value={form.type} onChange={v => set('type', v as HechsherType)} options={typeOptions} />
      {rabbanutOptions.length > 1 && (
        <Input label="Rabbanut" value={form.rabbanutId} onChange={v => set('rabbanutId', v)} options={rabbanutOptions} />
      )}
      {error && <Alert severity="error">{error}</Alert>}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.shortName || !form.type || saving} disableElevation>
          {saving ? <CircularProgress size={16} color="inherit" /> : (t.addRest?.save ?? 'Save')}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
