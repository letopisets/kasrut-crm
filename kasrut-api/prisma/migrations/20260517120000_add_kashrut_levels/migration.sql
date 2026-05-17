-- CreateTable
CREATE TABLE "kashrut_levels" (
    "id"          TEXT NOT NULL,
    "name"        TEXT NOT NULL,
    "description" TEXT,
    "sortOrder"   INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "kashrut_levels_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "kashrut_levels_name_key" ON "kashrut_levels"("name");

-- Seed default levels
INSERT INTO "kashrut_levels" ("id", "name", "sortOrder") VALUES
    ('kl_regular',  'Regular',  1),
    ('kl_mehadrin', 'Mehadrin', 2);

-- Add levelId column (nullable first so existing rows don't violate the constraint)
ALTER TABLE "restaurants" ADD COLUMN "levelId" TEXT;

-- Populate from existing level string values
UPDATE "restaurants"
SET "levelId" = CASE
    WHEN "level" = 'Mehadrin' THEN 'kl_mehadrin'
    ELSE 'kl_regular'
END;

-- Make non-nullable
ALTER TABLE "restaurants" ALTER COLUMN "levelId" SET NOT NULL;

-- Add FK constraint
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_levelId_fkey"
    FOREIGN KEY ("levelId") REFERENCES "kashrut_levels"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- CreateIndex on levelId
CREATE INDEX "restaurants_levelId_idx" ON "restaurants"("levelId");

-- Drop old column
ALTER TABLE "restaurants" DROP COLUMN "level";
