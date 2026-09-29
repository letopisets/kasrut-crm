ALTER TABLE "users" ADD COLUMN "mashgiachId" TEXT;

-- Backfill unambiguous existing accounts by tenant + normalized email.
UPDATE "users" AS u
SET "mashgiachId" = (
  SELECT m."id"
  FROM "mashgichim" AS m
  WHERE m."rabbanutId" = u."rabbanutId"
    AND lower(m."email") = lower(u."email")
  ORDER BY m."id"
  LIMIT 1
)
WHERE u."role" = 'mashgiach'
  AND u."rabbanutId" IS NOT NULL;

CREATE UNIQUE INDEX "users_mashgiachId_key" ON "users"("mashgiachId");
ALTER TABLE "users"
ADD CONSTRAINT "users_mashgiachId_fkey"
FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
