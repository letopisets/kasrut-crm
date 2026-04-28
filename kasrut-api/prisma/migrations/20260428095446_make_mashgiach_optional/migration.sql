-- DropForeignKey
ALTER TABLE "restaurants" DROP CONSTRAINT "restaurants_mashgiachId_fkey";

-- AlterTable
ALTER TABLE "restaurants" ALTER COLUMN "mashgiachId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_mashgiachId_fkey" FOREIGN KEY ("mashgiachId") REFERENCES "mashgichim"("id") ON DELETE SET NULL ON UPDATE CASCADE;
