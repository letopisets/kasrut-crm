import type { Hechsher } from '@/types'
import { useLang } from '@/i18n/useLang'
import { Badge } from '@/components/ui'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

interface Props { hechsher: Hechsher }

export function HechsherBlock({ hechsher: h }: Props) {
  const t = useLang()

  const rows = [
    [t.hechsherim.contact, h.contact],
    [t.hechsherim.phone,   h.phone],
    [t.hechsherim.email,   h.email],
  ]

  return (
    <Box sx={{
      background: '#161929',
      border: `1px solid ${alpha(h.color, 0.19)}`,
      borderRadius: 3.5, p: 2.75,
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    }}>
      <Typography sx={{ fontSize: 12, fontWeight: 600, color: h.color, mb: 1.375 }}>
        🏛 {t.restaurants.cols.hechsher}
      </Typography>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
        <Typography sx={{ fontSize: 14, fontWeight: 700 }}>{h.name}</Typography>
        <Badge label={h.type} color={h.color} small />
      </Box>
      {rows.map(([k, v]) => (
        <Box key={k} sx={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          py: 1, borderBottom: '1px solid #1C1F32', '&:last-child': { borderBottom: 'none' },
        }}>
          <Typography sx={{ fontSize: 11, color: 'text.secondary', fontWeight: 500 }}>{k}</Typography>
          <Typography sx={{ fontSize: 12, color: 'text.secondary', fontWeight: 500 }}>{v}</Typography>
        </Box>
      ))}
    </Box>
  )
}
