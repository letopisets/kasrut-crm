-- Drop denormalised lastInspection column. The application now derives the
-- value from the inspections relation (most recent inspection.date), so the
-- column has been a stale write-only field for some time.
ALTER TABLE "restaurants" DROP COLUMN "lastInspection";
