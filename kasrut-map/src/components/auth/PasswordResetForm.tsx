import { useState } from 'react'
import { Alert, Button, Stack, TextField } from '@mui/material'
import { useMapLang } from '@/i18n/useMapLang'
import type { PasswordResetChannel, PasswordResetRequestResponse } from '@/types'

interface Props {
  busy: boolean
  onRequestReset: (channel: PasswordResetChannel, identifier: string) => Promise<PasswordResetRequestResponse | null>
  onConfirmReset: (token: string, password: string) => void
}

export function PasswordResetForm({ busy, onRequestReset, onConfirmReset }: Props) {
  const t = useMapLang()
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
        label={t.sendCodeTo}
        value={channel}
        onChange={(e) => setChannel(e.target.value as PasswordResetChannel)}
        select
        SelectProps={{ native: true }}
        fullWidth
      >
        <option value="email">{t.emailOption}</option>
        <option value="phone">{t.phoneOption}</option>
      </TextField>
      <TextField
        label={channel === 'email' ? t.emailField : t.phoneField}
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
        {t.getCode}
      </Button>

      {resetRequested && (
        <Alert severity="success">{t.codeSent}</Alert>
      )}
      {devResetToken && (
        <Alert severity="info">{t.devCodePrefix}{devResetToken}</Alert>
      )}

      <TextField label={t.resetCode} value={token} onChange={(e) => setToken(e.target.value)} fullWidth />
      <TextField
        label={t.newPassword}
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        helperText={t.passwordHint}
        fullWidth
      />
      <Button
        variant="contained"
        onClick={() => onConfirmReset(token, password)}
        disabled={!token || !password || busy}
        sx={{ borderRadius: 1 }}
      >
        {t.changePassword}
      </Button>
    </Stack>
  )
}
