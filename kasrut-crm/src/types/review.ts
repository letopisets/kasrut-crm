// A public-map review as the CRM moderation list returns it. The author is a
// map user; the API deliberately never sends their email. updatedAt moves when
// the author rewrites the review.
export interface ModeratedReview {
  id: string
  rating: number
  text: string | null
  createdAt: string
  updatedAt: string
  restaurant: { id: string; name: string }
  author: { id: string; name: string }
}

// One page of GET /map/reviews, most recently written first; nextCursor is null
// on the last page.
export interface ModeratedReviewsPage {
  reviews: ModeratedReview[]
  nextCursor: string | null
}
