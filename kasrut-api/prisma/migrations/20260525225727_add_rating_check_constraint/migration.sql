-- Enforce rating is between 1 and 5 at the DB level.
-- The API already validates this with Zod, but the constraint
-- prevents any future code path from silently storing bad values.
ALTER TABLE "map_restaurant_reviews"
  ADD CONSTRAINT "map_restaurant_reviews_rating_check" CHECK (rating >= 1 AND rating <= 5);
