import { useMemo, useState } from 'react'
import { useAppDispatch, useAppSelector } from '@/store'
import { showSnackbar } from '@/store/uiSlice'
import { useLang } from '@/i18n/useLang'
import { useDeleteReviewMutation, useGetModerationReviewsInfiniteQuery } from '@/store/api/reviewsApi'
import type { ModeratedReview } from '@/types'

const LOCALES = { en: 'en-US', ru: 'ru-RU', he: 'he-IL' } as const
// createdAt and updatedAt of a new review are written a moment apart (and not
// necessarily by the same clock); only a later rewrite counts as an edit.
const EDIT_GRACE_MS = 60_000

export function useReviewsController() {
  const t        = useLang()
  const dispatch = useAppDispatch()
  const lang     = useAppSelector(s => s.lang.lang)
  const viewer   = useAppSelector(s => s.auth.user)

  // The store's resetApiOnSessionChange clears the whole API cache when a
  // different account signs in, so this list needs no per-viewer cache key.
  const {
    data, isLoading, isError, refetch, hasNextPage, fetchNextPage, isFetchingNextPage,
  } = useGetModerationReviewsInfiniteQuery(undefined, { skip: !viewer })
  const [deleteMutation, { isLoading: isDeleting }] = useDeleteReviewMutation()

  // The target outlives the dialog's open flag so the text does not blank out
  // during the closing transition.
  const [deleteTarget, setDeleteTarget] = useState<ModeratedReview | null>(null)
  const [deleteOpen, setDeleteOpen]     = useState(false)
  const [deleteFailed, setDeleteFailed] = useState(false)

  // A review can sit on two pages only if pages were fetched across a delete;
  // keep the first copy so React keys stay unique.
  const reviews = useMemo(() => {
    const seen = new Set<string>()
    return (data?.pages ?? []).flatMap(page => page.reviews).filter((review) => {
      if (seen.has(review.id)) return false
      seen.add(review.id)
      return true
    })
  }, [data?.pages])

  const requestDelete = (review: ModeratedReview) => {
    setDeleteTarget(review)
    setDeleteOpen(true)
    setDeleteFailed(false)
  }

  const cancelDelete = () => {
    if (isDeleting) return
    setDeleteOpen(false)
  }

  const confirmDelete = async () => {
    if (!deleteTarget || isDeleting) return
    setDeleteFailed(false)
    try {
      await deleteMutation(deleteTarget.id).unwrap()
      setDeleteOpen(false)
      dispatch(showSnackbar({ message: t.reviews.deleted, severity: 'success' }))
    } catch {
      setDeleteFailed(true)
    }
  }

  const formatDate = (iso: string) => new Date(iso).toLocaleDateString(LOCALES[lang] ?? LOCALES.en)
  const isEdited   = (review: ModeratedReview) =>
    Date.parse(review.updatedAt) - Date.parse(review.createdAt) > EDIT_GRACE_MS

  return {
    reviews,
    isLoading,
    isError,
    retry: () => { void refetch() },
    hasNextPage,
    isFetchingNextPage,
    loadMore: () => { void fetchNextPage() },
    deleteTarget,
    deleteOpen,
    deleteFailed,
    isDeleting,
    requestDelete,
    cancelDelete,
    confirmDelete,
    formatDate,
    isEdited,
  }
}
