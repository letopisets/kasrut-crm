-- CreateEnum
CREATE TYPE "RefreshTokenAudience" AS ENUM ('crm', 'map');

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "familyId" TEXT NOT NULL,
    "audience" "RefreshTokenAudience" NOT NULL,
    "userId" TEXT,
    "mapUserId" TEXT,
    "sessionVersion" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "userAgent" VARCHAR(200),

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- A CRM token belongs to exactly one CRM user and a map token to exactly one
-- map user; the other owner column stays NULL. Prisma cannot express this, so
-- it lives only here (the schema diff ignores CHECK constraints).
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_owner_matches_audience" CHECK (
    ("audience" = 'crm' AND "userId" IS NOT NULL AND "mapUserId" IS NULL) OR
    ("audience" = 'map' AND "mapUserId" IS NOT NULL AND "userId" IS NULL)
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_familyId_idx" ON "refresh_tokens"("familyId");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "refresh_tokens_mapUserId_idx" ON "refresh_tokens"("mapUserId");

-- CreateIndex
CREATE INDEX "refresh_tokens_expiresAt_idx" ON "refresh_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Access tokens issued before this release lived JWT_EXPIRES_IN (7 days in
-- production) and sat in localStorage. The clients drop them and every user
-- signs in once anyway (no refresh cookie exists yet), so end them now rather
-- than let a copy stay valid for up to a week.
UPDATE "users" SET "sessionVersion" = "sessionVersion" + 1;
UPDATE "map_users" SET "sessionVersion" = "sessionVersion" + 1;
