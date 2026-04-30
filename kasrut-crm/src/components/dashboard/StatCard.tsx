import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import ButtonBase from '@mui/material/ButtonBase'
import Typography from '@mui/material/Typography'

interface StatCardProps {
  icon:  string
  value: number
  label: string
  sub:   string
  color: string
  onClick?: () => void
}

export function StatCard({ icon, value, label, sub, color, onClick }: StatCardProps) {
  const content = (
    <>
      <Box sx={{
        position: 'absolute', top: 0, right: 0, width: 60, height: 60,
        background: `radial-gradient(circle at top right, ${alpha(color, 0.08)}, transparent)`,
        pointerEvents: 'none',
      }} />
      <Typography sx={{ fontSize: 18, mb: 0.75 }}>{icon}</Typography>
      <Typography sx={{ fontSize: 28, fontWeight: 800, color, lineHeight: 1 }}>{value}</Typography>
      <Typography sx={{ fontSize: 12, color: 'text.secondary', mt: 0.625 }}>{label}</Typography>
      <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.25 }}>{sub}</Typography>
    </>
  )

  if (onClick) {
    return (
      <ButtonBase
        onClick={onClick}
        sx={{
          width: '100%',
          textAlign: 'left',
          justifyContent: 'stretch',
          borderRadius: 3.5,
          transition: 'transform 0.15s, box-shadow 0.15s',
          '&:hover': { transform: 'translateY(-2px)' },
        }}
      >
        <Box sx={{
          width: '100%',
          background: '#161929',
          border: `1px solid ${alpha(color, 0.18)}`,
          borderRadius: 3.5,
          p: 2.5,
          position: 'relative', overflow: 'hidden',
          boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
        }}>
          {content}
        </Box>
      </ButtonBase>
    )
  }

  return (
    <Box sx={{
      background: '#161929',
      border: `1px solid ${alpha(color, 0.14)}`,
      borderRadius: 3.5,
      p: 2.5,
      position: 'relative', overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
    }}>
      {content}
    </Box>
  )
}
