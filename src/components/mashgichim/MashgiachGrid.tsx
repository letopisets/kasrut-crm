import type { Mashgiach, Hechsher } from '@/types'
import { MashgiachCard } from './MashgiachCard'

interface Props {
  mashgichim:  Mashgiach[]
  hechsherim:  Hechsher[]
  canEdit:     boolean
  onToggle:    (id: string) => void
  onDelete:    (id: string) => void
}

export function MashgiachGrid({ mashgichim, hechsherim, canEdit, onToggle, onDelete }: Props) {
  return (
    <div className="mashgiach-grid">
      {mashgichim.map(m => (
        <MashgiachCard
          key={m.id}
          mashgiach={m}
          hechsherim={hechsherim.filter(h => m.hechsherimIds.includes(h.id))}
          canEdit={canEdit}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </div>
  )
}
