-- AlterTable
ALTER TABLE "map_users" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Every account that exists before verification ships is grandfathered: its
-- email counts as verified since the account was created. Only password
-- registrations from now on start unverified.
UPDATE "map_users" SET "emailVerifiedAt" = "createdAt";

-- CreateTable
CREATE TABLE "map_email_verification_tokens" (
    "id" TEXT NOT NULL,
    "mapUserId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_email_verification_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_email_verification_tokens_tokenHash_key" ON "map_email_verification_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "map_email_verification_tokens_mapUserId_idx" ON "map_email_verification_tokens"("mapUserId");

-- AddForeignKey
ALTER TABLE "map_email_verification_tokens" ADD CONSTRAINT "map_email_verification_tokens_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
