-- AlterTable
ALTER TABLE "restaurants" ADD COLUMN "categoryId" TEXT;

-- CreateTable
CREATE TABLE "establishment_categories" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "nameHe" TEXT NOT NULL,
    "nameEn" TEXT,
    "nameRu" TEXT,

    CONSTRAINT "establishment_categories_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "establishment_categories_slug_key" ON "establishment_categories"("slug");

-- CreateIndex
CREATE INDEX "restaurants_categoryId_idx" ON "restaurants"("categoryId");

-- AddForeignKey
ALTER TABLE "restaurants" ADD CONSTRAINT "restaurants_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "establishment_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Seed default categories (מסעדות, מאפיות + קפה)
INSERT INTO "establishment_categories" ("id", "slug", "nameHe", "nameEn", "nameRu") VALUES
  ('cat_restaurant', 'restaurant', 'מסעדה',  'Restaurant', 'Ресторан'),
  ('cat_bakery',     'bakery',     'מאפייה', 'Bakery',     'Пекарня'),
  ('cat_cafe',       'cafe',       'קפה',    'Cafe',       'Кафе');
