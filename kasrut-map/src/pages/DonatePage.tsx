import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Box, AppBar, Toolbar, Typography, IconButton, Button,
  Card, CardContent, Stack, Snackbar,
} from '@mui/material'
import ArrowBackIcon from '@mui/icons-material/ArrowBack'
import ContentCopyIcon from '@mui/icons-material/ContentCopy'
import VolunteerActivismIcon from '@mui/icons-material/VolunteerActivism'
import { useMapLang } from '@/i18n/useMapLang'

const UKRAINE_INTERNATIONAL = [
  { labelKey: 'donateIban', value: 'GB58CLJU00997180094398' },
  { labelKey: 'donateBic', value: 'CLJUGB21' },
  { labelKey: 'donateReceiver', value: 'IVANTSOV STANISLAV' },
] as const

const UKRAINE_CARD = '4441 1144 5031 7412'
const ISRAEL_BIT_PHONE = '053-552-0466'

export default function DonatePage() {
  const t = useMapLang()
  const navigate = useNavigate()
  const [toastOpen, setToastOpen] = useState(false)

  const copy = async (raw: string) => {
    const value = raw.replace(/\s+/g, '')
    try {
      await navigator.clipboard.writeText(value)
      setToastOpen(true)
    } catch {
      const ta = document.createElement('textarea')
      ta.value = value
      ta.style.position = 'fixed'
      ta.style.opacity = '0'
      document.body.appendChild(ta)
      ta.select()
      try { document.execCommand('copy') } catch { /* ignore */ }
      document.body.removeChild(ta)
      setToastOpen(true)
    }
  }

  const Field = ({ label, value }: { label: string; value: string }) => (
    <Box
      sx={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        gap: 1, py: 1, borderBottom: '1px solid', borderColor: 'divider',
        '&:last-of-type': { borderBottom: 'none' },
      }}
    >
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="caption" color="text.secondary" sx={{ display: 'block', lineHeight: 1.2 }}>
          {label}
        </Typography>
        <Typography variant="body1" sx={{ fontWeight: 600, wordBreak: 'break-all' }}>
          {value}
        </Typography>
      </Box>
      <IconButton size="small" onClick={() => copy(value)} aria-label={t.donateCopy}>
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Box>
  )

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', bgcolor: 'background.default' }}>
      <AppBar position="static" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: '1px solid', borderColor: 'divider' }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton onClick={() => navigate('/')} sx={{ color: 'text.secondary' }} aria-label={t.donateBack}>
            <ArrowBackIcon />
          </IconButton>
          <VolunteerActivismIcon sx={{ color: 'primary.main' }} />
          <Typography variant="h6" color="primary.main" noWrap sx={{ flexGrow: 1, fontWeight: 800 }}>
            {t.donateTitle}
          </Typography>
        </Toolbar>
      </AppBar>

      <Box sx={{ flex: 1, py: 3, px: { xs: 2, sm: 3 }, maxWidth: 720, width: '100%', mx: 'auto' }}>
        <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
          {t.donateIntro}
        </Typography>

        <Stack spacing={2}>
          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                {t.donateUkraineInternational}
              </Typography>
              {UKRAINE_INTERNATIONAL.map(({ labelKey, value }) => (
                <Field key={labelKey} label={t[labelKey]} value={value} />
              ))}
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                {t.donateUkraineDomestic}
              </Typography>
              <Field label={t.donateCardNumber} value={UKRAINE_CARD} />
            </CardContent>
          </Card>

          <Card variant="outlined">
            <CardContent>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, mb: 1 }}>
                {t.donateIsraelBit}
              </Typography>
              <Field label={t.donateBitPhone} value={ISRAEL_BIT_PHONE} />
            </CardContent>
          </Card>
        </Stack>

        <Typography variant="body2" color="text.secondary" sx={{ mt: 4, textAlign: 'center', fontStyle: 'italic' }}>
          {t.donateThanks}
        </Typography>

        <Box sx={{ mt: 3, textAlign: 'center' }}>
          <Button onClick={() => navigate('/')} variant="text">
            {t.donateBack}
          </Button>
        </Box>
      </Box>

      <Snackbar
        open={toastOpen}
        autoHideDuration={2000}
        onClose={() => setToastOpen(false)}
        message={t.donateCopied}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      />
    </Box>
  )
}
