import { alpha } from '@mui/material/styles'
import type { Hechsher } from '@/types'

interface BadgeProps {
  label: string
  color: string
  small?: boolean
}

export function Badge({ label, color, small = false }: BadgeProps) {
  return (
    <span
      style={{
        display: 'inline-block',
        background: alpha(color, 0.09),
        color,
        border: `1px solid ${alpha(color, 0.21)}`,
        padding: small ? '2px 8px' : '3px 11px',
        borderRadius: 20,
        fontSize: small ? 10 : 11,
        fontWeight: 700,
        whiteSpace: 'nowrap',
        lineHeight: 1.4,
      }}
    >
      {label}
    </span>
  )
}

interface HechsherTagProps {
  hechsher: Hechsher
  small?: boolean
}

export function HechsherTag({ hechsher, small }: HechsherTagProps) {
  return <Badge label={hechsher.shortName} color={hechsher.color || '#888'} small={small} />
}
