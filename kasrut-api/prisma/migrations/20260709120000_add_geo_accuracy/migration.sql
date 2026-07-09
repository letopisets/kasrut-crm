-- CreateEnum
CREATE TYPE "GeoAccuracy" AS ENUM ('exact', 'approximate');

-- AlterTable
-- All existing rows default to 'approximate': imported coordinates are city-centre
-- jitter, so we don't claim precision we don't have. The re-geocode job upgrades
-- verified rows to 'exact'.
ALTER TABLE "restaurants"
  ADD COLUMN "geoAccuracy" "GeoAccuracy" NOT NULL DEFAULT 'approximate',
  ADD COLUMN "geocodeAttemptedAt" TIMESTAMP(3);
