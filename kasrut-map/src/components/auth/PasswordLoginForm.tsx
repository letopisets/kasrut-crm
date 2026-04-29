import { useState } from 'react'
import { Button, Link, Stack, TextField } from '@mui/material'
import { useMapLang } from '@/i18n/useMapLang'

interface Props {
  busy: boolean
  onSubmit: (email: string, password: string) => void
  onForgotPassword: () => void
}

export function PasswordLoginForm({ busy, onSubmit, onForgotPassword }: Props) {
  const t = useMapLang()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Stack spacing={1.5}>
      <TextField label={t.emailField} type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
      <TextField label={t.passwordField} type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
      <Button
        variant="contained"
        onClick={() => onSubmit(email, password)}
        disabled={!email || !password || busy}
        sx={{ borderRadius: 1 }}
      >
        {t.loginBtn2}
      </Button>
      <Link component="button" variant="body2" onClick={onForgotPassword} sx={{ alignSelf: 'flex-start' }}>
        {t.forgotPassword}
      </Link>
    </Stack>
  )
}
