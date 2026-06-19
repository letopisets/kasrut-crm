-- Backfill establishment "вид" (EstablishmentCategory) for restaurants that
-- predate the categoryId column (added in 20260525232321_add_establishment_categories)
-- and were never classified. Mirrors inferCategoryId() in
-- scripts/import-pdf-data.ts, classifying by name keywords.
--
-- Idempotent and non-destructive: only touches rows where "categoryId" IS NULL,
-- so it never overwrites an explicit вид and is safe to re-run. Existing data is
-- preserved — this only fills the gap.
--
-- The seed rows cat_restaurant / cat_bakery / cat_cafe were inserted by the
-- 20260525232321 migration, so these FK targets always exist.

-- Bakery (מאפייה): bakeries, bread / challah, patisserie
UPDATE "restaurants"
SET "categoryId" = 'cat_bakery'
WHERE "categoryId" IS NULL
  AND (
       "name" ~ 'מאפי|לחם|חלה|חלות|בייקרי|קונדיטור'
    OR "name" ~* 'bakery'
  );

-- Cafe (קפה): coffee houses, ice cream, bagel bars
UPDATE "restaurants"
SET "categoryId" = 'cat_cafe'
WHERE "categoryId" IS NULL
  AND (
       "name" ~ 'קפה|גלידה|גליד|בייגל'
    OR "name" ~* 'cafe|coffee'
  );

-- Everything else with no kind yet → restaurant
-- (ресторан = всё остальное, что не מאפייה / не קפה)
UPDATE "restaurants"
SET "categoryId" = 'cat_restaurant'
WHERE "categoryId" IS NULL;
