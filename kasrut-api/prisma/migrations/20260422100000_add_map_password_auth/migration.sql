-- CreateEnum
CREATE TYPE "MapPasswordResetChannel" AS ENUM ('email', 'phone');

-- AlterTable
ALTER TABLE "map_users"
ADD COLUMN "phone" TEXT,
ADD COLUMN "firstName" TEXT,
ADD COLUMN "lastName" TEXT,
ADD COLUMN "passwordHash" TEXT;

-- CreateTable
CREATE TABLE "map_password_reset_tokens" (
    "id" TEXT NOT NULL,
    "mapUserId" TEXT NOT NULL,
    "channel" "MapPasswordResetChannel" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "map_password_reset_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_users_phone_key" ON "map_users"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "map_password_reset_tokens_tokenHash_key" ON "map_password_reset_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "map_password_reset_tokens_mapUserId_idx" ON "map_password_reset_tokens"("mapUserId");

-- CreateIndex
CREATE INDEX "map_password_reset_tokens_expiresAt_idx" ON "map_password_reset_tokens"("expiresAt");

-- AddForeignKey
ALTER TABLE "map_password_reset_tokens" ADD CONSTRAINT "map_password_reset_tokens_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
