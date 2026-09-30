import { useLang } from '@/i18n/useLang'
import { useReviewsController } from '@/controllers/useReviewsController'
import type { ModeratedReview } from '@/types'
import { alpha } from '@mui/material/styles'
import Box from '@mui/material/Box'
import Typography from '@mui/material/Typography'
import Button from '@mui/material/Button'
import CircularProgress from '@mui/material/CircularProgress'
import Alert from '@mui/material/Alert'
import Rating from '@mui/material/Rating'
import Dialog from '@mui/material/Dialog'
import DialogTitle from '@mui/material/DialogTitle'
import DialogContent from '@mui/material/DialogContent'
import DialogContentText from '@mui/material/DialogContentText'
import DialogActions from '@mui/material/DialogActions'
import DeleteIcon from '@mui/icons-material/Delete'

const DANGER = '#E74C3C'

// Fills {placeholders} in one pass with a function replacer: author and
// restaurant names are free text, so a '$&' or '{restaurant}' inside one must
// come out literally instead of being read as a replacement pattern.
function fill(template: string, values: Record<string, string>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => (Object.hasOwn(values, key) ? values[key] : token))
}

// Low ratings are the ones most likely to need a moderator's eye.
function ratingColor(rating: number): string {
  if (rating <= 2) return DANGER
  if (rating === 3) return '#F39C12'
  return '#2ECC71'
}

export default function Reviews() {
  const t    = useLang()
  const tr   = t.reviews
  const ctrl = useReviewsController()

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 2.75 }}>
        <Typography variant="h2" sx={{ fontSize: { xs: 16, sm: 18, lg: 21 }, fontWeight: 700, letterSpacing: '-0.3px' }}>
          {tr.title}
        </Typography>
        <Typography sx={{ color: 'text.secondary', fontSize: 12, mt: 0.5 }}>
          {tr.sub}
        </Typography>
      </Box>

      {ctrl.isError && (
        <Alert
          severity="error"
          sx={{ mb: 2 }}
          action={<Button color="inherit" size="small" onClick={ctrl.retry}>{tr.retry}</Button>}
        >
          {tr.loadError}
        </Alert>
      )}

      {ctrl.isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress size={32} sx={{ color: '#E8C96D' }} />
        </Box>
      ) : ctrl.reviews.length === 0 ? (
        !ctrl.isError && (
          <Typography sx={{ textAlign: 'center', py: 8, color: 'text.disabled', fontSize: 13 }}>
            {tr.empty}
          </Typography>
        )
      ) : (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
          {ctrl.reviews.map(review => (
            <ReviewCard
              key={review.id}
              review={review}
              date={ctrl.formatDate(review.createdAt)}
              editedDate={ctrl.isEdited(review) ? ctrl.formatDate(review.updatedAt) : null}
              onDelete={() => ctrl.requestDelete(review)}
            />
          ))}
        </Box>
      )}

      {ctrl.hasNextPage && (
        <Box sx={{ display: 'flex', justifyContent: 'center', mt: 2 }}>
          <Button
            size="small"
            variant="outlined"
            onClick={ctrl.loadMore}
            disabled={ctrl.isFetchingNextPage}
            startIcon={ctrl.isFetchingNextPage ? <CircularProgress size={14} /> : undefined}
            sx={{ fontSize: 12, textTransform: 'none', borderColor: '#252840', color: 'text.secondary' }}
          >
            {tr.loadMore}
          </Button>
        </Box>
      )}

      <Dialog
        open={ctrl.deleteOpen}
        onClose={ctrl.cancelDelete}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>{tr.confirmTitle}</DialogTitle>
        <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <DialogContentText sx={{ fontSize: 13 }}>
            {ctrl.deleteTarget && fill(tr.confirmBody, {
              author: ctrl.deleteTarget.author.name,
              restaurant: ctrl.deleteTarget.restaurant.name,
            })}
          </DialogContentText>
          {ctrl.deleteFailed && <Alert severity="error">{tr.deleteError}</Alert>}
        </DialogContent>
        <DialogActions sx={{ px: 3, pb: 2 }}>
          <Button
            onClick={ctrl.cancelDelete}
            disabled={ctrl.isDeleting}
            sx={{ fontSize: 12, color: 'text.secondary', textTransform: 'none' }}
          >
            {tr.cancel}
          </Button>
          <Button
            variant="contained"
            disableElevation
            onClick={() => { void ctrl.confirmDelete() }}
            disabled={ctrl.isDeleting}
            sx={{ fontSize: 12, textTransform: 'none', background: DANGER, '&:hover': { background: '#C0392B' } }}
          >
            {tr.confirmDelete}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  )
}

function ReviewCard({ review, date, editedDate, onDelete }: {
  review: ModeratedReview
  date: string
  editedDate: string | null
  onDelete: () => void
}) {
  const tr = useLang().reviews
  const rc = ratingColor(review.rating)

  return (
    <Box
      component="article"
      aria-label={`${review.restaurant.name} — ${review.author.name}`}
      sx={{
        background: '#161929', border: '1px solid #252840',
        borderInlineStart: `3px solid ${rc}`,
        borderRadius: 2.5, p: 2,
        transition: 'background 0.18s', '&:hover': { background: '#1A1D30' },
      }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 1 }}>
        <Rating
          value={review.rating}
          readOnly
          size="small"
          getLabelText={value => fill(tr.ratingLabel, { rating: String(value) })}
          sx={{ color: rc }}
        />
        <Typography sx={{ fontSize: 13, fontWeight: 600, minWidth: 0, overflowWrap: 'anywhere' }}>
          {review.restaurant.name}
        </Typography>
        <Typography sx={{ fontSize: 11, color: 'text.disabled', marginInlineStart: 'auto' }}>
          {date}
          {editedDate && (
            <Box component="span" sx={{ color: '#F39C12', fontStyle: 'italic' }}>
              {' · '}{fill(tr.edited, { date: editedDate })}
            </Box>
          )}
        </Typography>
      </Box>

      {review.text ? (
        <Typography sx={{ fontSize: 12, color: 'text.secondary', whiteSpace: 'pre-wrap', overflowWrap: 'anywhere', mb: 1 }}>
          {review.text}
        </Typography>
      ) : (
        <Typography sx={{ fontSize: 12, color: 'text.disabled', fontStyle: 'italic', mb: 1 }}>
          {tr.noText}
        </Typography>
      )}

      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap' }}>
        <Typography sx={{ fontSize: 11, color: 'text.disabled' }}>
          {tr.author}: <Box component="span" sx={{ color: '#9A9AB0' }}>{review.author.name}</Box>
        </Typography>
        <Button
          size="small"
          variant="outlined"
          startIcon={<DeleteIcon sx={{ fontSize: 15 }} />}
          onClick={onDelete}
          sx={{
            marginInlineStart: 'auto', fontSize: 11, textTransform: 'none',
            borderColor: alpha(DANGER, 0.4), color: DANGER,
            '&:hover': { background: alpha(DANGER, 0.08), borderColor: DANGER },
          }}
        >
          {tr.delete}
        </Button>
      </Box>
    </Box>
  )
}
