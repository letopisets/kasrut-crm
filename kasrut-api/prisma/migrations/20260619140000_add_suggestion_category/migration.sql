-- Add proposed establishment "вид" (EstablishmentCategory.slug) to map
-- suggestions, so the public "suggest a place" flow can specify
-- restaurant / bakery / cafe — mirroring proposedFoodType (тип).
ALTER TABLE "map_restaurant_suggestions" ADD COLUMN "proposedCategory" TEXT;
