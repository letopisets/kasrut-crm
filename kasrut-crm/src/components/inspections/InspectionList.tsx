import type { Inspection } from '@/types'
import { InspectionRow } from './InspectionRow'
import Box from '@mui/material/Box'

interface Props { inspections: Inspection[] }

export function InspectionList({ inspections }: Props) {
  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      {inspections.map(i => (
        <InspectionRow key={i.id} inspection={i} />
      ))}
    </Box>
  )
}
