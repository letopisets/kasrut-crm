import { useState } from 'react'
import { Alert, Button, Stack, Typography } from '@mui/material'
import { useResendEmailVerificationMutation } from '@/store/api/mapCommunityApi'
import { useMapLang } from '@/i18n/useMapLang'

interface Props {
  message: string
}

type ResendOutcome = 'sent' | 'limited' | 'failed'

// "Check your email" plus a button that mails the link again. The API caps
// resends per account and per address and answers 429 beyond that.
export function EmailVerificationNotice({ message }: Props) {
  const t = useMapLang()
  const [resend, { isLoading }] = useResendEmailVerificationMutation()
  const [outcome, setOutcome] = useState<ResendOutcome | null>(null)

  const handleResend = async () => {
    setOutcome(null)
    try {
      await resend().unwrap()
      setOutcome('sent')
    } catch (err) {
      const status = typeof err === 'object' && err !== null && 'status' in err ? (err as { status: unknown }).status : null
      setOutcome(status === 429 ? 'limited' : 'failed')
    }
  }

  return (
    <Stack spacing={1.5}>
      <Typography variant="body2">{message}</Typography>
      {outcome === 'sent' && <Alert severity="success">{t.verifyEmailResent}</Alert>}
      {outcome === 'limited' && <Alert severity="warning">{t.tooManyAttempts}</Alert>}
      {outcome === 'failed' && <Alert severity="error">{t.verifyEmailResendError}</Alert>}
      <Button variant="outlined" onClick={() => void handleResend()} disabled={isLoading} sx={{ borderRadius: 1, alignSelf: 'flex-start' }}>
        {t.verifyEmailResend}
      </Button>
    </Stack>
  )
}
