import { useState } from 'react'
import { useLang } from '@/i18n/useLang'
import { useGetServiceLogsQuery } from '@/store/api/logsApi'
import type { ServiceLogLevel } from '@/types'
import { STATUS_COLORS, ROLE_COLORS } from '@/theme'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Grid from '@mui/material/Grid'
import Table from '@mui/material/Table'
import TableHead from '@mui/material/TableHead'
import TableBody from '@mui/material/TableBody'
import TableRow from '@mui/material/TableRow'
import TableCell from '@mui/material/TableCell'
import Chip from '@mui/material/Chip'

type Filter = ServiceLogLevel | 'all'

const FILTERS: Filter[] = ['all', 'error', 'warn', 'info']
const LEVEL_COLOR: Record<ServiceLogLevel, string> = {
  error: STATUS_COLORS.critical,
  warn: STATUS_COLORS.warning,
  info: ROLE_COLORS.rabbanut,
}

export default function Logs() {
  const t = useLang()
  const tl = t.logs!
  const [level, setLevel] = useState<Filter>('all')
  const { data, isLoading } = useGetServiceLogsQuery({ level, limit: 200 })
  const logs = data?.logs ?? []
  const summary = data?.summary ?? { errors24h: 0, warnings24h: 0, authIssues: 0, api5xx: 0 }

  const cards = [
    { label: tl.cards.errors24h, value: summary.errors24h, color: STATUS_COLORS.critical },
    { label: tl.cards.warnings24h, value: summary.warnings24h, color: STATUS_COLORS.warning },
    { label: tl.cards.authIssues, value: summary.authIssues, color: ROLE_COLORS.owner },
    { label: tl.cards.api5xx, value: summary.api5xx, color: STATUS_COLORS.critical },
  ]

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, gap: 1.5, mb: 2.5, flexDirection: { xs: 'column', sm: 'row' } }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {tl.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {logs.length} {tl.count} · {tl.sub}
          </Typography>
        </Box>

        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
          {FILTERS.map(f => {
            const active = level === f
            const color = f === 'all' ? ROLE_COLORS.owner : LEVEL_COLOR[f]
            return (
              <Button
                key={f}
                size="small"
                onClick={() => setLevel(f)}
                sx={{
                  minWidth: 0, px: 1.5, py: '5px',
                  fontSize: 12, fontWeight: active ? 700 : 500,
                  color: active ? color : 'text.secondary',
                  bgcolor: active ? alpha(color, 0.08) : 'transparent',
                  border: '1px solid',
                  borderColor: active ? alpha(color, 0.28) : '#252840',
                  borderRadius: 1,
                }}
              >
                {tl.filters[f]}
              </Button>
            )
          })}
        </Box>
      </Box>

      <Grid container spacing={1.5} sx={{ mb: 2.5 }}>
        {cards.map(card => (
          <Grid key={card.label} size={{ xs: 6, lg: 3 }}>
            <Box sx={{
              bgcolor: '#161929',
              border: `1px solid ${alpha(card.color, 0.16)}`,
              borderRadius: 2.5,
              p: 2,
            }}>
              <Typography sx={{ fontSize: 24, fontWeight: 900, color: card.color, lineHeight: 1 }}>
                {card.value}
              </Typography>
              <Typography sx={{ fontSize: 11, color: 'text.secondary', mt: 0.75 }}>
                {card.label}
              </Typography>
            </Box>
          </Grid>
        ))}
      </Grid>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : logs.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {tl.empty}
        </Typography>
      ) : (
        <Box sx={{ bgcolor: '#161929', border: '1px solid #252840', borderRadius: 2.5, overflow: 'hidden' }}>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{tl.cols.time}</TableCell>
                <TableCell>{tl.cols.level}</TableCell>
                <TableCell>{tl.cols.service}</TableCell>
                <TableCell>{tl.cols.user}</TableCell>
                <TableCell>{tl.cols.action}</TableCell>
                <TableCell>{tl.cols.entity}</TableCell>
                <TableCell>{tl.cols.status}</TableCell>
                <TableCell>{tl.cols.message}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map(log => {
                const color = LEVEL_COLOR[log.level]
                return (
                  <TableRow key={log.id} hover>
                    <TableCell sx={{ whiteSpace: 'nowrap', color: 'text.secondary' }}>
                      {new Date(log.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <Chip label={log.level} size="small" sx={{ color, bgcolor: alpha(color, 0.1), border: `1px solid ${alpha(color, 0.25)}` }} />
                    </TableCell>
                    <TableCell>{log.service}</TableCell>
                    <TableCell sx={{ maxWidth: 180 }}>
                      <Typography sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.userEmail ?? '—'}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 220 }}>
                      <Typography sx={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {log.action ?? (`${log.method ?? ''} ${log.path ?? ''}`.trim() || '—')}
                      </Typography>
                    </TableCell>
                    <TableCell>{log.entityType ? `${log.entityType}${log.entityId ? `:${log.entityId}` : ''}` : '—'}</TableCell>
                    <TableCell>{log.statusCode ?? '—'}</TableCell>
                    <TableCell sx={{ minWidth: 240 }}>
                      <Typography sx={{ fontSize: 12 }}>{log.message}</Typography>
                      {log.requestId && (
                        <Typography sx={{ fontSize: 10, color: 'text.disabled', mt: 0.25 }}>
                          request {log.requestId}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </Box>
      )}
    </Box>
  )
}
