-- CreateEnum
CREATE TYPE "MapAuthProvider" AS ENUM ('google', 'apple');

-- CreateEnum
CREATE TYPE "MapSuggestionType" AS ENUM ('add', 'update');

-- CreateEnum
CREATE TYPE "MapSuggestionStatus" AS ENUM ('pending', 'approved', 'rejected');

-- CreateTable
CREATE TABLE "map_users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "avatarUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_oauth_identities" (
    "id" TEXT NOT NULL,
    "provider" "MapAuthProvider" NOT NULL,
    "providerUserId" TEXT NOT NULL,
    "mapUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_oauth_identities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_restaurant_suggestions" (
    "id" TEXT NOT NULL,
    "type" "MapSuggestionType" NOT NULL,
    "status" "MapSuggestionStatus" NOT NULL DEFAULT 'pending',
    "restaurantId" TEXT,
    "mapUserId" TEXT NOT NULL,
    "proposedName" TEXT,
    "proposedAddress" TEXT,
    "proposedCity" TEXT,
    "proposedHechsher" TEXT,
    "proposedKashrutStatus" TEXT,
    "proposedLat" DOUBLE PRECISION,
    "proposedLng" DOUBLE PRECISION,
    "notes" TEXT,
    "reviewerNote" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_restaurant_suggestions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "map_restaurant_reviews" (
    "id" TEXT NOT NULL,
    "restaurantId" TEXT NOT NULL,
    "mapUserId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "text" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "map_restaurant_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "map_users_email_key" ON "map_users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "map_oauth_identities_provider_providerUserId_key" ON "map_oauth_identities"("provider", "providerUserId");

-- CreateIndex
CREATE UNIQUE INDEX "map_oauth_identities_provider_mapUserId_key" ON "map_oauth_identities"("provider", "mapUserId");

-- CreateIndex
CREATE INDEX "map_restaurant_suggestions_mapUserId_idx" ON "map_restaurant_suggestions"("mapUserId");

-- CreateIndex
CREATE INDEX "map_restaurant_suggestions_restaurantId_idx" ON "map_restaurant_suggestions"("restaurantId");

-- CreateIndex
CREATE INDEX "map_restaurant_suggestions_status_idx" ON "map_restaurant_suggestions"("status");

-- CreateIndex
CREATE UNIQUE INDEX "map_restaurant_reviews_restaurantId_mapUserId_key" ON "map_restaurant_reviews"("restaurantId", "mapUserId");

-- CreateIndex
CREATE INDEX "map_restaurant_reviews_restaurantId_idx" ON "map_restaurant_reviews"("restaurantId");

-- CreateIndex
CREATE INDEX "map_restaurant_reviews_mapUserId_idx" ON "map_restaurant_reviews"("mapUserId");

-- AddCheck
ALTER TABLE "map_restaurant_reviews" ADD CONSTRAINT "map_restaurant_reviews_rating_check" CHECK ("rating" >= 1 AND "rating" <= 5);

-- AddForeignKey
ALTER TABLE "map_oauth_identities" ADD CONSTRAINT "map_oauth_identities_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_restaurant_suggestions" ADD CONSTRAINT "map_restaurant_suggestions_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_restaurant_suggestions" ADD CONSTRAINT "map_restaurant_suggestions_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_restaurant_reviews" ADD CONSTRAINT "map_restaurant_reviews_mapUserId_fkey" FOREIGN KEY ("mapUserId") REFERENCES "map_users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "map_restaurant_reviews" ADD CONSTRAINT "map_restaurant_reviews_restaurantId_fkey" FOREIGN KEY ("restaurantId") REFERENCES "restaurants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
