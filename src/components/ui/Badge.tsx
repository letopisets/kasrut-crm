import type { Hechsher } from '@/types'

interface BadgeProps {
  label: string
  color: string
  small?: boolean
}

export function Badge({ label, color, small = false }: BadgeProps) {
  return (
    <span
      className={small ? 'badge badge-sm' : 'badge'}
      style={{ '--c': color } as React.CSSProperties}
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
