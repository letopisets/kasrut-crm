import type { Hechsher, Mashgiach } from '@/types'
import { HechsherCard } from './HechsherCard'
import Grid from '@mui/material/Grid'

interface Props {
  hechsherim: Hechsher[]
  expandedId: string | null
  canEdit:    boolean
  getStats:   (h: Hechsher) => { restaurants: number; mashgichim: number }
  getMashgichimForHechsher: (id: string) => Mashgiach[]
  onToggle:   (id: string) => void
  onDelete:   (id: string) => void
}

export function HechsherGrid({ hechsherim, expandedId, canEdit, getStats, getMashgichimForHechsher, onToggle, onDelete }: Props) {
  return (
    <Grid container spacing={1.75}>
      {hechsherim.map(h => (
        <Grid key={h.id} size={{ xs: 12, md: 6 }}>
          <HechsherCard
            hechsher={h}
            stats={getStats(h)}
            mashgichim={getMashgichimForHechsher(h.id)}
            expanded={expandedId === h.id}
            canEdit={canEdit}
            onToggle={onToggle}
            onDelete={onDelete}
          />
        </Grid>
      ))}
    </Grid>
  )
}
