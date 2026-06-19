-- Drop denormalised CertStatus column. Status is always computed from
-- `expires` at read time (see calcStatus in restaurants.repo.ts) and writes
-- to this column drifted because there is no cron to refresh it.
ALTER TABLE "restaurants" DROP COLUMN "status";

-- The CertStatus enum becomes unused after dropping the column.
DROP TYPE "CertStatus";
