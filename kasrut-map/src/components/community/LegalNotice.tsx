import { Alert } from '@mui/material'

export function LegalNotice() {
  return (
    <Alert
      severity="warning"
      square
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
