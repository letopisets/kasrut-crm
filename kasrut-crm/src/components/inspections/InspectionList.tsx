import type { Inspection } from '@/types'
import { InspectionRow } from './InspectionRow'

interface Props { inspections: Inspection[] }

export function InspectionList({ inspections }: Props) {
  return (
    <div className="inspection-list">
      {inspections.map(i => (
        <InspectionRow key={i.id} inspection={i} />
      ))}
    </div>
  )
}
