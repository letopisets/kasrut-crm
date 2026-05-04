-- Add proposed cuisine type and image to community suggestions
ALTER TABLE "map_restaurant_suggestions"
    ADD COLUMN "proposedFoodType" "FoodType",
    ADD COLUMN "proposedImageUrl" TEXT;
