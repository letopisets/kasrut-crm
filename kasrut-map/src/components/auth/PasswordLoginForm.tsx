import { useState } from 'react'
import { Button, Link, Stack, TextField } from '@mui/material'

interface Props {
  busy: boolean
  onSubmit: (email: string, password: string) => void
  onForgotPassword: () => void
}

export function PasswordLoginForm({ busy, onSubmit, onForgotPassword }: Props) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  return (
    <Stack spacing={1.5}>
      <TextField label="Почта" type="email" value={email} onChange={(e) => setEmail(e.target.value)} fullWidth />
      <TextField label="Пароль" type="password" value={password} onChange={(e) => setPassword(e.target.value)} fullWidth />
      <Button
        variant="contained"
        onClick={() => onSubmit(email, password)}
        disabled={!email || !password || busy}
        sx={{ borderRadius: 1 }}
      >
        Войти
      </Button>
      <Link component="button" variant="body2" onClick={onForgotPassword} sx={{ alignSelf: 'flex-start' }}>
        Забыли пароль?
      </Link>
    </Stack>
  )
}
