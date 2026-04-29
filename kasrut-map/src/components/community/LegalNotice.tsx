import { useState } from 'react'
import { Alert } from '@mui/material'
import { useMapLang } from '@/i18n/useMapLang'

const STORAGE_KEY = 'legalNoticeDismissed'

export function LegalNotice() {
  const t = useMapLang()
  const [visible, setVisible] = useState(() => localStorage.getItem(STORAGE_KEY) !== 'true')

  if (!visible) return null

  return (
    <Alert
      severity="warning"
      square
      onClose={() => {
        localStorage.setItem(STORAGE_KEY, 'true')
        setVisible(false)
      }}
      sx={{
        borderRadius: 0,
        py: 0.5,
        px: 2,
        alignItems: 'center',
        '& .MuiAlert-message': { py: 0.25, fontSize: '0.85rem' },
      }}
    >
      {t.legalNotice}
    </Alert>
  )
}
