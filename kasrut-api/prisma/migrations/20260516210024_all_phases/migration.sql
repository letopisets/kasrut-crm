/*
  Warnings:

  - The `size` column on the `documents` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - The `kitniyot` column on the `restaurants` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Added the required column `updatedAt` to the `documents` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `hechsherim` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `inspections` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `mashgichim` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `rabbanuts` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `restaurants` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `users` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "inspections" DROP CONSTRAINT "inspections_mashgiachId_fkey";

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "size",
ADD COLUMN     "size" BIGINT NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "hechsherim" ADD COLUMN     "active" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "inspections" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "mashgiachId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "mashgichim" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "rabbanuts" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "settlementId" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
DROP COLUMN "kitniyot",
ADD COLUMN     "kitniyot" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3),
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Backfill existing rows only; Prisma manages updatedAt for new writes.
ALTER TABLE "documents" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "hechsherim" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "inspections" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "mashgichim" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "rabbanuts" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "restaurants" ALTER COLUMN "updatedAt" DROP DEFAULT;
ALTER TABLE "users" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- CreateTable
CREATE TABLE "countries" (
    "code" CHAR(2) NOT NULL,
    "nameEn" TEXT NOT NULL,

    CONSTRAINT "countries_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "settlements" (
    "id" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameRu" TEXT,
    "lat" DOUBLE PRECISION,
    "lng" DOUBLE PRECISION,
    "type" TEXT NOT NULL DEFAULT 'city',
    "countryCode" CHAR(2) NOT NULL,

    CONSTRAINT "settlements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "settlements_nameHe_idx" ON "settlements"("nameHe");

-- CreateIndex
CREATE INDEX "settlements_nameEn_idx" ON "settlements"("nameEn");

-- CreateIndex
CREATE INDEX "settlements_nameRu_idx" ON "settlements"("nameRu");

-- CreateIndex
CREATE INDEX "inspections_restaurantId_idx" ON "inspections"("restaurantId");

-- CreateIndex
CREATE INDEX "inspections_mashgiachId_idx" ON "inspections"("mashgiachId");

-- CreateIndex
CREATE INDEX "inspections_date_idx" ON "inspections"("date");

-- CreateIndex
CREATE INDEX "inspections_restaurantId_date_idx" ON "inspections"("restaurantId", "date");

-- CreateIndex
CREATE INDEX "restaurants_mashgiachId_idx" ON "restaurants"("mashgiachId");

-- CreateIndex
CREATE INDEX "restaurants_rabbanutId_idx" ON "restaurants"("rabbanutId");

-- CreateIndex
CREATE INDEX "restaurants_expires_idx" ON "restaurants"("expires");

-- CreateIndex
CREATE INDEX "restaurants_deletedAt_idx" ON "restaurants"("deletedAt");

-- AddForeignKey
ALTER TABLE "rabbanuts" ADD CONSTRAINT "rabbanuts_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hechsherim" ADD CONSTRAINT "hechsherim_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inspections" ADD CONSTRAINT "inspections_mashgiachId_fkey" FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_countryCode_fkey" FOREIGN KEY ("countryCode") REFERENCES "countries"("code") ON DELETE RESTRICT ON UPDATE CASCADE;
