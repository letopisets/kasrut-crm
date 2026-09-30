-- An inspection may only name a mashgiach of its restaurant's rabbanut. That
-- was checked only when the inspection row itself was written, so moving a
-- restaurant to another rabbanut left its inspection history pointing at the
-- old tenant's mashgichim.

-- Repair rows that became inconsistent that way, as
-- 20260714100000_enforce_tenant_invariants did for legacy rows: the
-- inspection stays with its restaurant, only the cross-tenant mashgiach link
-- is cleared.
UPDATE "inspections" AS i
SET "mashgiachId" = NULL
FROM "mashgichim" AS m, "restaurants" AS r
WHERE i."mashgiachId" = m."id"
  AND i."restaurantId" = r."id"
  AND r."rabbanutId" IS DISTINCT FROM m."rabbanutId";

-- Refuse a restaurant move while such inspections remain. The API's move path
-- (restaurantsRepo.update) detaches them in the same transaction first, like
-- the mashgiach and hechsher move guards expect of their callers.
CREATE OR REPLACE FUNCTION prevent_inconsistent_restaurant_move()
RETURNS trigger AS $$
BEGIN
  IF NEW."rabbanutId" IS DISTINCT FROM OLD."rabbanutId" AND EXISTS (
    SELECT 1 FROM "inspections" i
    JOIN "mashgichim" m ON m."id" = i."mashgiachId"
    WHERE i."restaurantId" = OLD."id" AND m."rabbanutId" IS DISTINCT FROM NEW."rabbanutId"
  ) THEN
    RAISE EXCEPTION 'Cannot move a restaurant while cross-tenant dependants remain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER restaurants_tenant_move_guard
BEFORE UPDATE OF "rabbanutId" ON "restaurants"
FOR EACH ROW EXECUTE FUNCTION prevent_inconsistent_restaurant_move();
