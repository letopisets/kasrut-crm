import { useEffect, useMemo, useState } from 'react'
import {
  Alert, Avatar, Box, Button, CircularProgress, Divider,
  Rating, Stack, TextField, Typography,
} from '@mui/material'
import { skipToken } from '@reduxjs/toolkit/query'
import {
  useGetMyRestaurantReviewQuery,
  useGetRestaurantReviewsInfiniteQuery,
  useSubmitRestaurantReviewMutation,
} from '@/store/api/mapCommunityApi'
import { useAppSelector } from '@/store/hooks'
import { useMapLang } from '@/i18n/useMapLang'
import type { MapReview, MapUser } from '@/types'

interface Props {
  restaurantId: string
  user: MapUser | null
  onRequireAuth: () => void
}

function formatDate(value: string, locale: string): string {
  return new Date(value).toLocaleDateString(locale, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

export function ReviewsPanel({ restaurantId, user, onRequireAuth }: Props) {
  const t = useMapLang()
  const lang = useAppSelector(s => s.mapLang.lang)
  const locale = lang === 'ru' ? 'ru-RU' : lang === 'he' ? 'he-IL' : 'en-US'

  const {
    data, isLoading, isError, hasNextPage, fetchNextPage, isFetchingNextPage,
  } = useGetRestaurantReviewsInfiniteQuery(restaurantId)
  // The list is paginated, so the user's own review may not be on a loaded
  // page — it comes from its own endpoint. currentData, not data: after an
  // account switch the previous user's review must not linger.
  const {
    currentData: mine, isError: isOwnReviewError, refetch: refetchOwnReview,
  } = useGetMyRestaurantReviewQuery(
    user ? { restaurantId, userId: user.id } : skipToken,
  )
  // Saving is an upsert, so until the existing review is known the empty form
  // would silently overwrite it.
  const ownReviewUnknown = Boolean(user) && mine === undefined
  const [submitReview, submitState] = useSubmitRestaurantReviewMutation()
  const [rating, setRating] = useState<number | null>(5)
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const ownReview = user ? mine?.review ?? null : null
  // Every page carries the same restaurant-wide summary.
  const summary = data?.pages[0]
  const reviews = useMemo(() => {
    const seen = new Set<string>()
    return (data?.pages ?? []).flatMap(page => page.reviews).filter((review) => {
      if (seen.has(review.id)) return false
      seen.add(review.id)
      return true
    })
  }, [data?.pages])

  useEffect(() => {
    if (!ownReview) return
    setRating(ownReview.rating)
    setText(ownReview.text ?? '')
  }, [ownReview])

  const handleSubmit = async () => {
    if (!user) { onRequireAuth(); return }
    if (!rating) { setError(t.rateError); return }
    try {
      await submitReview({ restaurantId, rating, text: text.trim() || null }).unwrap()
      setError(null)
      setSuccess(true)
    } catch {
      setError(t.saveReviewError)
    }
  }

  return (
    <Stack spacing={2}>
      <Box>
        <Typography variant="subtitle1" sx={{ fontWeight: 800 }}>{t.reviewsTitle}</Typography>
        <Typography variant="body2" color="text.secondary">
          {summary?.reviewCount
            ? t.avgRating
                .replace('{avg}', String(summary.ratingAvg?.toFixed(1)))
                .replace('{count}', String(summary.reviewCount))
            : t.noReviews}
        </Typography>
      </Box>

      {isError && <Alert severity="error">{t.loadReviewsError}</Alert>}
      {ownReviewUnknown && isOwnReviewError && (
        <Alert
          severity="error"
          action={(
            <Button color="inherit" size="small" onClick={() => { void refetchOwnReview() }}>
              {t.retryBtn}
            </Button>
          )}
        >
          {t.loadOwnReviewError}
        </Alert>
      )}
      {success && <Alert severity="success">{t.reviewSaved}</Alert>}
      {error && <Alert severity="error">{error}</Alert>}

      <Stack spacing={1}>
        <Typography variant="body2" sx={{ fontWeight: 700 }}>
          {ownReview ? t.updateYourReview : t.yourReview}
        </Typography>
        <Rating
          value={rating}
          onChange={(_event, value) => setRating(value)}
          disabled={!user}
        />
        <TextField
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={user ? t.reviewPlaceholder : t.reviewPlaceholderGuest}
          multiline
          minRows={2}
          disabled={!user}
          fullWidth
        />
        <Button
          variant="outlined"
          onClick={user ? handleSubmit : onRequireAuth}
          disabled={submitState.isLoading || ownReviewUnknown}
          sx={{ alignSelf: 'flex-start', borderRadius: 1 }}
        >
          {user ? t.saveReview : t.loginAndReview}
        </Button>
      </Stack>

      <Divider />

      {isLoading && (
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <CircularProgress size={18} />
          <Typography variant="body2" color="text.secondary">{t.loadingReviews}</Typography>
        </Box>
      )}

      <Stack spacing={1.5}>
        {reviews.map((review: MapReview) => (
          <Box key={review.id}>
            <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'flex-start' }}>
              <Avatar src={review.user.avatarUrl ?? undefined} sx={{ width: 32, height: 32 }}>
                {review.user.name.slice(0, 1).toUpperCase()}
              </Avatar>
              <Box sx={{ minWidth: 0, flex: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', gap: 1 }}>
                  <Typography variant="body2" noWrap sx={{ fontWeight: 700 }}>{review.user.name}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ flexShrink: 0 }}>
                    {formatDate(review.createdAt, locale)}
                  </Typography>
                </Box>
                <Rating value={review.rating} readOnly size="small" />
                {review.text && (
                  <Typography variant="body2" color="text.secondary" sx={{ whiteSpace: 'pre-wrap' }}>
                    {review.text}
                  </Typography>
                )}
              </Box>
            </Box>
          </Box>
        ))}
      </Stack>

      {hasNextPage && (
        <Button
          variant="text"
          onClick={() => { void fetchNextPage() }}
          disabled={isFetchingNextPage}
          startIcon={isFetchingNextPage ? <CircularProgress size={16} /> : undefined}
          sx={{ alignSelf: 'center', borderRadius: 1 }}
        >
          {t.showMoreReviews}
        </Button>
      )}
    </Stack>
  )
}
