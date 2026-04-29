import { useState } from 'react'
import { Button, Stack, TextField } from '@mui/material'
import { useMapLang } from '@/i18n/useMapLang'

export interface RegistrationFormData {
  firstName: string
  lastName: string
  email: string
  phone: string
  password: string
}

interface Props {
  busy: boolean
  onSubmit: (data: RegistrationFormData) => void
}

export function RegistrationForm({ busy, onSubmit }: Props) {
  const t = useMapLang()
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Stack spacing={1.5}>
      <TextField label={t.firstName} value={firstName} onChange={(e) => setFirstName(e.target.value)} fullWidth />
      <TextField label={t.lastName} value={lastName} onChange={(e) => setLastName(e.target.value)} fullWidth />
      <TextField label={t.emailField} type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
      <TextField label={t.phoneField} value={phone} onChange={(e) => setPhone(e.target.value)} fullWidth />
      <TextField
        label={t.passwordField}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        helperText={t.passwordHint}
        fullWidth
      />
      <Button
        variant="contained"
        onClick={() => onSubmit({ firstName, lastName, email, phone, password })}
        disabled={!firstName || !lastName || !email || !phone || !password || busy}
        sx={{ borderRadius: 1 }}
      >
        {t.registerBtn}
      </Button>
    </Stack>
  )
}
