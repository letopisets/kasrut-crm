import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { Role } from '@/types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

const ROLES: Role[] = ['owner', 'rabbanut', 'mashgiach']

interface SelectOption { value: string; label: string }

interface UserInput {
  name: string
  email: string
  password: string
  role: Role
  rabbanutId?: string
}

interface Props {
  rabbanutOptions: SelectOption[]
  onSave:  (data: UserInput) => void
  onClose: () => void
}

export function UserForm({ rabbanutOptions, onSave, onClose }: Props) {
  const t = useLang()

  const [form, setForm] = useState({
    name:       '',
    email:      '',
    password:   '',
    role:       'rabbanut' as Role,
    rabbanutId: rabbanutOptions[0]?.value ?? '',
  })

  const set = <K extends keyof typeof form>(k: K, v: typeof form[K]) =>
    setForm(p => ({ ...p, [k]: v }))

  const needsRabbanut = form.role === 'rabbanut' || form.role === 'mashgiach'

  const handleSave = () => {
    if (!form.name || !form.email || !form.password) return
    onSave({
      name:      form.name,
      email:     form.email,
      password:  form.password,
      role:      form.role,
      ...(needsRabbanut && form.rabbanutId ? { rabbanutId: form.rabbanutId } : {}),
    })
  }

  const roleOptions = ROLES.map(r => ({ value: r, label: t.roles[r] }))

  return (
    <Modal title={t.users?.add ?? 'Add User'} onClose={onClose}>
      <Input label={t.mashgichim?.name  ?? 'Full Name'} value={form.name}     onChange={v => set('name', v)} />
      <Input label={t.mashgichim?.email ?? 'Email'}     value={form.email}    onChange={v => set('email', v)} type="email" />
      <Input label="Password"                           value={form.password} onChange={v => set('password', v)} type="password" />
      <Input
        label={t.users?.role ?? 'Role'}
        value={form.role}
        onChange={v => set('role', v as Role)}
        options={roleOptions}
      />
      {needsRabbanut && rabbanutOptions.length > 0 && (
        <Input
          label={t.users?.org ?? 'Organization'}
          value={form.rabbanutId}
          onChange={v => set('rabbanutId', v)}
          options={rabbanutOptions}
        />
      )}
      <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', mt: 1 }}>
        <Button variant="contained" onClick={handleSave} disabled={!form.name || !form.email || !form.password} disableElevation>
          {t.addRest?.save ?? 'Save'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
