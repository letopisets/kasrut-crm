import { useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useLang } from '@/i18n/useLang'
import { useGetSuggestionsQuery, useReviewSuggestionMutation } from '@/store/api/suggestionsApi'
import { Badge } from '@/components/ui'
import type { MapSuggestion, SuggestionStatus } from '@/types'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import TextField from '@mui/material/TextField'
import Collapse from '@mui/material/Collapse'

type Filter = 'all' | SuggestionStatus

const STATUS_COLOR: Record<SuggestionStatus, string> = {
  pending:  '#F39C12',
  approved: '#2ECC71',
  rejected: '#E74C3C',
}

export default function Suggestions() {
  const t    = useLang()
  const ts   = t.suggestions!
  const [searchParams, setSearchParams] = useSearchParams()
  const initialStatus = searchParams.get('status') as SuggestionStatus | 'all' | null

  const [filter, setFilterState]      = useState<Filter>(
    initialStatus && ['all', 'pending', 'approved', 'rejected'].includes(initialStatus) ? initialStatus : 'pending'
  )
  const [reviewingId, setReviewingId] = useState<string | null>(null)
  const [noteText, setNoteText]       = useState('')

  const { data = [], isLoading } = useGetSuggestionsQuery(filter)
  const [reviewSuggestion, { isLoading: isReviewing }] = useReviewSuggestionMutation()

  const handleReview = async (id: string, status: 'approved' | 'rejected') => {
    await reviewSuggestion({ id, status, reviewerNote: noteText.trim() || undefined })
    setReviewingId(null)
    setNoteText('')
  }

  const FILTERS: Filter[] = ['all', 'pending', 'approved', 'rejected']

  const setFilter = (nextFilter: Filter) => {
    setFilterState(nextFilter)
    const next = new URLSearchParams(searchParams)
    if (nextFilter === 'all') next.delete('status')
    else next.set('status', nextFilter)
    setSearchParams(next, { replace: true })
  }

  const filterLabel = (f: Filter) => {
    if (f === 'all') return ts.all
    return ts[f]
  }

  return (
    <Box>
      {/* Header */}
      <Box sx={{
        display: 'flex', justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' },
        flexDirection: { xs: 'column', sm: 'row' }, gap: 1.5, mb: 2.75,
      }}>
        <Box>
          <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
            {ts.title}
          </Typography>
          <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
            {data.length} {ts.count} — {ts.sub}
          </Typography>
        </Box>
      </Box>

      {/* Filter tabs */}
      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.75, mb: 2.5 }}>
        {FILTERS.map(f => {
          const active = filter === f
          const color  = f === 'all' ? '#E8C96D' : STATUS_COLOR[f as SuggestionStatus]
          return (
            <Button key={f} size="small" onClick={() => setFilter(f)} sx={{
              borderRadius: '20px', px: 1.75, py: 0.5,
              fontSize: 12, fontWeight: active ? 600 : 400,
              color:      active ? color : 'text.secondary',
              background: active ? alpha(color, 0.12) : 'transparent',
              border:    `1px solid ${active ? alpha(color, 0.4) : 'transparent'}`,
              '&:hover':  { background: alpha(color, 0.08), color },
              transition: 'all 0.15s', textTransform: 'none',
            }}>
              {filterLabel(f)}
            </Button>
          )
        })}
      </Box>

      {/* List */}
      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : data.length === 0 ? (
        <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
          {ts.empty}
        </Typography>
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {data.map((s: MapSuggestion) => {
            const sc     = STATUS_COLOR[s.status]
            const isOpen = reviewingId === s.id
            return (
              <Box key={s.id} sx={{
                background: '#161929', border: `1px solid #252840`,
                borderLeft: `3px solid ${sc}`,
                borderRadius: 2.5, p: 2,
                transition: 'background 0.18s', '&:hover': { background: '#1A1D30' },
              }}>
                {/* Top row */}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
                  <Badge
                    label={s.type === 'add' ? ts.typeAdd : ts.typeUpdate}
                    color={s.type === 'add' ? '#9B59B6' : '#3498DB'}
                    small
                  />
                  <Badge label={ts[s.status]} color={sc} small />
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', ml: 'auto' }}>
                    {new Date(s.createdAt).toLocaleDateString()}
                  </Typography>
                </Box>

                {/* Proposed fields */}
                <Box sx={{ display: 'grid', gridTemplateColumns: { xs: '1fr', sm: '1fr 1fr', md: '1fr 1fr 1fr' }, gap: 0.75, mb: 1 }}>
                  <Field label={ts.proposedName}    value={s.proposedName} />
                  <Field label={ts.proposedAddress} value={s.proposedAddress} />
                  <Field label={ts.proposedCity}    value={s.proposedCity} />
                  <Field label={ts.proposedHechsher} value={s.proposedHechsher} />
                  <Field label={ts.proposedStatus}  value={s.proposedKashrutStatus} />
                </Box>

                {/* User notes */}
                {s.notes && (
                  <Box sx={{ mb: 1 }}>
                    <Typography sx={{ fontSize: 10, color: 'text.disabled', mb: 0.25 }}>{ts.notes}</Typography>
                    <Typography sx={{ fontSize: 12, color: 'text.secondary', fontStyle: 'italic' }}>"{s.notes}"</Typography>
                  </Box>
                )}

                {/* Submitter */}
                {s.user && (
                  <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
                    {ts.user}: <span style={{ color: '#9A9AB0' }}>{s.user.name}</span> — {s.user.email}
                  </Typography>
                )}

                {/* Reviewer note (already reviewed) */}
                {s.reviewerNote && s.status !== 'pending' && (
                  <Typography sx={{ fontSize: 11, color: 'text.disabled', mt: 0.75, fontStyle: 'italic' }}>
                    {ts.reviewerNote}: {s.reviewerNote}
                  </Typography>
                )}

                {/* Actions for pending */}
                {s.status === 'pending' && (
                  <Box sx={{ mt: 1.5 }}>
                    <Collapse in={isOpen}>
                      <TextField
                        size="small"
                        fullWidth
                        multiline
                        minRows={2}
                        placeholder={ts.reviewerNotePlaceholder}
                        value={noteText}
                        onChange={e => setNoteText(e.target.value)}
                        sx={{
                          mb: 1,
                          '& .MuiOutlinedInput-root': {
                            fontSize: 12,
                            background: '#1E2235',
                            '& fieldset': { borderColor: '#252840' },
                            '&:hover fieldset': { borderColor: '#3A3D54' },
                          },
                        }}
                      />
                    </Collapse>
                    <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                      {!isOpen ? (
                        <>
                          <Button
                            size="small" variant="outlined" disableElevation
                            onClick={() => { setReviewingId(s.id); setNoteText('') }}
                            sx={{ fontSize: 11, borderColor: alpha('#2ECC71', 0.4), color: '#2ECC71', '&:hover': { background: alpha('#2ECC71', 0.08) }, textTransform: 'none' }}
                          >
                            {ts.approve}
                          </Button>
                          <Button
                            size="small" variant="outlined" disableElevation
                            onClick={() => { setReviewingId(s.id + '_reject'); setNoteText('') }}
                            sx={{ fontSize: 11, borderColor: alpha('#E74C3C', 0.4), color: '#E74C3C', '&:hover': { background: alpha('#E74C3C', 0.08) }, textTransform: 'none' }}
                          >
                            {ts.reject}
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            size="small" variant="contained" disableElevation disabled={isReviewing}
                            onClick={() => handleReview(s.id, reviewingId === s.id ? 'approved' : 'rejected')}
                            sx={{
                              fontSize: 11, textTransform: 'none',
                              background: reviewingId === s.id ? '#2ECC71' : '#E74C3C',
                              '&:hover': { background: reviewingId === s.id ? '#27AE60' : '#C0392B' },
                            }}
                          >
                            {reviewingId === s.id ? ts.approve : ts.reject}
                          </Button>
                          <Button
                            size="small" variant="text" disableElevation
                            onClick={() => setReviewingId(null)}
                            sx={{ fontSize: 11, color: 'text.secondary', textTransform: 'none' }}
                          >
                            {ts.cancel}
                          </Button>
                        </>
                      )}
                    </Box>
                  </Box>
                )}
              </Box>
            )
          })}
        </Box>
      )}
    </Box>
  )
}

function Field({ label, value }: { label: string; value: string | null }) {
  if (!value) return null
  return (
    <Box>
      <Typography sx={{ fontSize: 10, color: 'text.disabled', mb: 0.125 }}>{label}</Typography>
      <Typography sx={{ fontSize: 12, fontWeight: 500 }}>{value}</Typography>
    </Box>
  )
}
