-- CreateEnum
CREATE TYPE "SettlementType" AS ENUM ('city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter', 'other');

-- Coerce any values not in the enum to 'other' before casting the column.
UPDATE "settlements"
  SET "type" = 'other'
  WHERE "type" NOT IN ('city', 'town', 'village', 'suburb', 'neighbourhood', 'quarter');

-- AlterTable: cast in-place to preserve all rows
ALTER TABLE "settlements"
  ALTER COLUMN "type" TYPE "SettlementType" USING "type"::"SettlementType",
  ALTER COLUMN "type" SET DEFAULT 'city'::"SettlementType";
