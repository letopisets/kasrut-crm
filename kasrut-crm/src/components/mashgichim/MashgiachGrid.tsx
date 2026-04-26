import type { Mashgiach, Hechsher } from '@/types'
import { MashgiachCard } from './MashgiachCard'
import Grid from '@mui/material/Grid'

interface Props {
  mashgichim:  Mashgiach[]
  hechsherim:  Hechsher[]
  canEdit:     boolean
  onToggle:    (id: string) => void
  onDelete:    (id: string) => void
  onEdit:      (m: Mashgiach) => void
}

export function MashgiachGrid({ mashgichim, hechsherim, canEdit, onToggle, onDelete, onEdit }: Props) {
  return (
    <Grid container spacing={1.75}>
      {mashgichim.map(m => (
        <Grid key={m.id} size={{ xs: 12, md: 6, xl: 4 }}>
          <MashgiachCard
            mashgiach={m}
            hechsherim={hechsherim.filter(h => m.hechsherimIds.includes(h.id))}
            canEdit={canEdit}
            onToggle={onToggle}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        </Grid>
      ))}
    </Grid>
  )
}
