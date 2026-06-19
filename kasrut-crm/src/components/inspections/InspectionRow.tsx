import { memo, useMemo } from 'react'
import type { Inspection, InspectionResult } from '@/types'
import { useGetRestaurantsQuery } from '@/store/api/restaurantsApi'
import { useGetMashgichimQuery } from '@/store/api/mashgichimApi'
import { useSetInspectionResultMutation } from '@/store/api/inspectionsApi'
import { usePermissions } from '@/hooks/usePermissions'
import { useLang } from '@/i18n/useLang'
import { Badge, Select } from '@/components/ui'
import { TYPE_COLOR, RESULT_COLOR } from '@/lib/statusColor'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'

export { RESULT_COLOR } from '@/lib/statusColor'

interface Props { inspection: Inspection }

export const InspectionRow = memo(function InspectionRow({ inspection: ins }: Props) {
  const t    = useLang()
  const perm = usePermissions()
  const [setResultMutation] = useSetInspectionResultMutation()
  const { data: restaurants = [] } = useGetRestaurantsQuery()
  const { data: mashgichim  = [] } = useGetMashgichimQuery()
  const restaurant = restaurants.find(r => r.id === ins.restaurantId)
  const mashgiach  = mashgichim.find(m => m.id === ins.mashgiachId)

  const resultOptions = useMemo(() =>
    (['pending', 'open', 'pass', 'fail'] as InspectionResult[]).map(r => ({
      value: r, label: t.inspections.result[r],
    }))
  , [t])

  const tc = TYPE_COLOR[ins.type]

  return (
    <Box sx={{
      background: '#161929',
      border: `1px solid #252840`,
      borderLeft: `3px solid ${tc}`,
      borderRadius: 2.5,
      px: 2.25, py: 1.625,
      display: 'grid',
      gridTemplateColumns: perm.canEdit
        ? { xs: '1fr auto auto', sm: '1fr auto auto auto auto' }
        : { xs: '1fr auto auto', sm: '1fr auto auto auto' },
      alignItems: 'center',
      gap: { xs: 1, sm: 2.25 },
      boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
      transition: 'background 0.18s ease',
      '&:hover': { background: '#1E2235' },
    }}>
      <Box>
        <Typography sx={{ fontSize: 13, fontWeight: 600 }}>{restaurant?.name ?? '—'}</Typography>
        <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.125 }}>{restaurant?.city}</Typography>
        {ins.notes && (
          <Typography sx={{ fontSize: 10, color: 'text.secondary', mt: 0.25, fontStyle: 'italic' }}>
            {ins.notes}
          </Typography>
        )}
      </Box>

      <Box sx={{ textAlign: 'center', display: { xs: 'none', sm: 'block' } }}>
        <Typography sx={{ fontSize: 9, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.2px', mb: 0.25 }}>
          {t.inspections.assign}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{mashgiach?.name ?? '—'}</Typography>
      </Box>

      <Box sx={{ textAlign: 'center' }}>
        <Typography sx={{ fontSize: 9, color: 'text.secondary', textTransform: 'uppercase', letterSpacing: '0.2px', mb: 0.25 }}>
          {t.inspections.date}
        </Typography>
        <Typography sx={{ fontSize: 12, color: 'text.secondary' }}>{ins.date}</Typography>
      </Box>

      <Badge
        label={ins.type === 'urgent' ? t.inspections.urgent : t.inspections.planned}
        color={TYPE_COLOR[ins.type]}
        small
      />

      {perm.canEdit ? (
        <Select
          value={ins.result}
          onChange={v => { void setResultMutation({ id: ins.id, result: v as InspectionResult }) }}
          options={resultOptions}
          color={RESULT_COLOR[ins.result]}
        />
      ) : (
        <Badge label={t.inspections.result[ins.result]} color={RESULT_COLOR[ins.result]} small />
      )}
    </Box>
  )
})
