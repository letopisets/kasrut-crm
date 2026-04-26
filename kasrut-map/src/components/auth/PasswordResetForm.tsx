import { useState } from 'react'
import { Alert, Button, Stack, TextField } from '@mui/material'
import type { PasswordResetChannel, PasswordResetRequestResponse } from '@/types'

interface Props {
  busy: boolean
  onRequestReset: (channel: PasswordResetChannel, identifier: string) => Promise<PasswordResetRequestResponse | null>
  onConfirmReset: (token: string, password: string) => void
}

export function PasswordResetForm({ busy, onRequestReset, onConfirmReset }: Props) {
  const [channel, setChannel] = useState<PasswordResetChannel>('email')
  const [identifier, setIdentifier] = useState('')
  const [token, setToken] = useState('')
  const [password, setPassword] = useState('')
  const [devResetToken, setDevResetToken] = useState<string | null>(null)
  const [resetRequested, setResetRequested] = useState(false)

  const requestReset = async () => {
    const result = await onRequestReset(channel, identifier)
    if (!result) return
    setResetRequested(true)
    setDevResetToken(result.devResetToken ?? null)
  }

  return (
    <Stack spacing={1.5}>
      <TextField
        label="Куда отправить код"
        value={channel}
        onChange={(e) => setChannel(e.target.value as PasswordResetChannel)}
        select
        SelectProps={{ native: true }}
        fullWidth
      >
        <option value="email">Почта</option>
        <option value="phone">Телефон</option>
      </TextField>
      <TextField
        label={channel === 'email' ? 'Почта' : 'Телефон'}
        value={identifier}
        onChange={(e) => setIdentifier(e.target.value)}
        fullWidth
      />
      <Button
        variant="outlined"
        onClick={requestReset}
        disabled={!identifier || busy}
        sx={{ borderRadius: 1 }}
      >
        Получить код
      </Button>

      {resetRequested && (
        <Alert severity="success">
          Если аккаунт найден, код отправлен выбранным способом.
        </Alert>
      )}
      {devResetToken && (
        <Alert severity="info">
          Dev-код для теста: {devResetToken}
        </Alert>
      )}

      <TextField label="Код сброса" value={token} onChange={(e) => setToken(e.target.value)} fullWidth />
      <TextField
        label="Новый пароль"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        helperText="Минимум 8 символов, буквы и цифры"
        fullWidth
      />
      <Button
        variant="contained"
        onClick={() => onConfirmReset(token, password)}
        disabled={!token || !password || busy}
        sx={{ borderRadius: 1 }}
      >
        Сменить пароль
      </Button>
    </Stack>
  )
}
