import { useState } from 'react'
import { useAuthStore } from '@/store/useAuthStore'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'
import type { Mashgiach } from '@/types'

interface SelectOption { value: string; label: string }
type MashgiachInput = Omit<Mashgiach, 'id' | 'assignedRestaurantIds'>

interface Props {
  hechsherOptions: SelectOption[]
  initial?:        Mashgiach
  onSave:          (data: MashgiachInput) => void
  onClose:         () => void
}

export function MashgiachForm({ hechsherOptions, initial, onSave, onClose }: Props) {
  const t    = useLang()
  const user = useAuthStore(s => s.user)

  const [form, setForm] = useState({
    name:          initial?.name          ?? '',
    phone:         initial?.phone         ?? '',
    email:         initial?.email         ?? '',
    area:          initial?.area          ?? '',
    hechsherimIds: initial?.hechsherimIds ?? [] as string[],
    active:        initial?.active        ?? true,
    rabbanutId:    initial?.rabbanutId    ?? user?.rabbanutId ?? 'rb1',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const title = initial ? 'Edit Mashgiach' : (t.mashgichim?.addTitle ?? 'Add Mashgiach')

  return (
    <Modal title={title} onClose={onClose}>
      <Input label={t.mashgichim?.name  ?? 'Name'}  value={form.name}  onChange={v => set('name', v)} />
      <Input label={t.mashgichim?.phone ?? 'Phone'} value={form.phone} onChange={v => set('phone', v)} />
      <Input label={t.mashgichim?.email ?? 'Email'} value={form.email} onChange={v => set('email', v)} />
      <Input label={t.mashgichim?.area  ?? 'Area'}  value={form.area}  onChange={v => set('area', v)} />
      <Input
        label={t.mashgichim?.hechsherim ?? 'Hechsher'}
        value={form.hechsherimIds[0] ?? ''}
        onChange={v => set('hechsherimIds', v ? [v] : [])}
        options={hechsherOptions}
      />
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={() => onSave(form)} disabled={!form.name || !form.phone} disableElevation>
          {t.addRest?.save ?? 'Save'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
