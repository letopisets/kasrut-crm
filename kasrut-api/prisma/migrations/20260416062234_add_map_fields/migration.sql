-- CreateEnum
CREATE TYPE "FoodType" AS ENUM ('meat', 'dairy', 'pareve', 'takeaway');

-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN     "foodType" "FoodType" NOT NULL DEFAULT 'pareve',
ADD COLUMN     "hours" TEXT,
ADD COLUMN     "lat" DOUBLE PRECISION,
ADD COLUMN     "lng" DOUBLE PRECISION,
ADD COLUMN     "phone" TEXT;
