import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { Modal, Input } from '@/components/ui'
import type { Role } from '@/types'
import Box from '@mui/material/Box'
import Button from '@mui/material/Button'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

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

  const [submitted, setSubmitted] = useState(false)

  const emailError    = !form.email ? t.validation.required
    : !EMAIL_RE.test(form.email)    ? t.validation.invalidEmail
    : undefined
  const passwordError = !form.password               ? t.validation.required
    : form.password.length < 8                       ? t.validation.passwordTooShort
    : !/[a-zA-Zа-яА-ЯёЁ]/.test(form.password) || !/\d/.test(form.password) ? t.validation.passwordWeak
    : undefined
  const canSave = !form.name || !!emailError || !!passwordError

  const handleSave = () => {
    setSubmitted(true)
    if (canSave) return
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
      <Input
        label={t.mashgichim?.name ?? 'Full Name'}
        value={form.name}
        onChange={v => set('name', v)}
        required
        error={submitted && !form.name}
        helperText={submitted && !form.name ? t.validation.required : undefined}
      />
      <Input
        label={t.mashgichim?.email ?? 'Email'}
        value={form.email}
        onChange={v => set('email', v)}
        type="email"
        required
        error={submitted && !!emailError}
        helperText={submitted ? emailError : undefined}
      />
      <Input
        label="Password"
        value={form.password}
        onChange={v => set('password', v)}
        type="password"
        required
        error={submitted && !!passwordError}
        helperText={submitted ? passwordError : undefined}
      />
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
        <Button variant="contained" onClick={handleSave} disableElevation>
          {t.addRest?.save ?? 'Save'}
        </Button>
        <Button variant="outlined" color="inherit" onClick={onClose} sx={{ color: 'text.secondary' }}>
          {t.addRest?.cancel ?? 'Cancel'}
        </Button>
      </Box>
    </Modal>
  )
}
