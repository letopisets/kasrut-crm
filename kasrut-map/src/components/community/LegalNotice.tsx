import { useState } from 'react'
import { Alert } from '@mui/material'

const STORAGE_KEY = 'legalNoticeDismissed'

export function LegalNotice() {
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
      Информация справочная. Перед заказом проверьте действующую теудат кашрут и название хекшера непосредственно в заведении.
    </Alert>
  )
}
