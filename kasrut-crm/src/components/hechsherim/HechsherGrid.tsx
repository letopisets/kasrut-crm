import type { Hechsher, Mashgiach } from '@/types'
import { HechsherCard } from './HechsherCard'

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
    <div className="hechsher-grid">
      {hechsherim.map(h => (
        <HechsherCard
          key={h.id}
          hechsher={h}
          stats={getStats(h)}
          mashgichim={getMashgichimForHechsher(h.id)}
          expanded={expandedId === h.id}
          canEdit={canEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
