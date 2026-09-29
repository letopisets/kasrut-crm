-- Repair legacy cross-tenant assignments before installing write-time guards.
UPDATE "users" AS u
SET "mashgiachId" = NULL
FROM "mashgichim" AS m
WHERE u."mashgiachId" = m."id"
  AND (u."role" <> 'mashgiach' OR u."rabbanutId" IS DISTINCT FROM m."rabbanutId");

UPDATE "users"
SET "mashgiachId" = NULL
WHERE "role" <> 'mashgiach' AND "mashgiachId" IS NOT NULL;

-- Email is preferred; for old installations where login and staff email differ,
-- backfill by normalized name only when it is unambiguous inside one tenant.
WITH unique_name_matches AS (
  SELECT u."id" AS user_id, MIN(m."id") AS mashgiach_id
  FROM "users" AS u
  JOIN "mashgichim" AS m
    ON m."rabbanutId" = u."rabbanutId"
   AND lower(btrim(m."name")) = lower(btrim(u."name"))
  WHERE u."role" = 'mashgiach' AND u."mashgiachId" IS NULL
  GROUP BY u."id"
  HAVING COUNT(*) = 1
)
UPDATE "users" AS u
SET "mashgiachId" = matches.mashgiach_id
FROM unique_name_matches AS matches
WHERE u."id" = matches.user_id;

-- Do not silently lock staff out. An operator must explicitly map every
-- remaining account before this migration can finish.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM "users"
    WHERE "role" = 'mashgiach'
      AND ("rabbanutId" IS NULL OR "mashgiachId" IS NULL)
  ) THEN
    RAISE EXCEPTION
      'Unmapped mashgiach users remain. Set users.mashgiachId to an active profile in the same rabbanut and rerun migrations.';
  END IF;
END $$;

UPDATE "restaurants" AS r
SET "mashgiachId" = NULL
FROM "mashgichim" AS m
WHERE r."mashgiachId" = m."id"
  AND r."rabbanutId" IS DISTINCT FROM m."rabbanutId";

UPDATE "inspections" AS i
SET "mashgiachId" = NULL
FROM "mashgichim" AS m, "restaurants" AS r
WHERE i."mashgiachId" = m."id"
  AND i."restaurantId" = r."id"
  AND r."rabbanutId" IS DISTINCT FROM m."rabbanutId";

DELETE FROM "mashgiach_hechsher" AS mh
USING "mashgichim" AS m, "hechsherim" AS h
WHERE mh."mashgiachId" = m."id"
  AND mh."hechsherId" = h."id"
  AND m."rabbanutId" IS DISTINCT FROM h."rabbanutId";

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurants" AS r
    JOIN "hechsherim" AS h ON h."id" = r."hechsherId"
    WHERE r."rabbanutId" IS DISTINCT FROM h."rabbanutId"
  ) THEN
    RAISE EXCEPTION
      'Restaurants with a cross-tenant hechsher remain. Correct their hechsherId/rabbanutId before rerunning migrations.';
  END IF;
END $$;

CREATE OR REPLACE FUNCTION enforce_user_mashgiach_tenant()
RETURNS trigger AS $$
DECLARE profile_tenant TEXT;
BEGIN
  IF NEW."role" = 'mashgiach' THEN
    IF NEW."rabbanutId" IS NULL OR NEW."mashgiachId" IS NULL THEN
      RAISE EXCEPTION 'Mashgiach users require rabbanutId and mashgiachId' USING ERRCODE = '23514';
    END IF;
    SELECT "rabbanutId" INTO profile_tenant FROM "mashgichim" WHERE "id" = NEW."mashgiachId";
    IF profile_tenant IS NULL OR profile_tenant IS DISTINCT FROM NEW."rabbanutId" THEN
      RAISE EXCEPTION 'User and mashgiach must belong to the same rabbanut' USING ERRCODE = '23514';
    END IF;
  ELSIF NEW."mashgiachId" IS NOT NULL THEN
    RAISE EXCEPTION 'Only mashgiach users may reference a mashgiach profile' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER users_mashgiach_tenant_guard
BEFORE INSERT OR UPDATE OF "role", "rabbanutId", "mashgiachId" ON "users"
FOR EACH ROW EXECUTE FUNCTION enforce_user_mashgiach_tenant();

CREATE OR REPLACE FUNCTION enforce_restaurant_tenant_links()
RETURNS trigger AS $$
DECLARE linked_tenant TEXT;
BEGIN
  SELECT "rabbanutId" INTO linked_tenant FROM "hechsherim" WHERE "id" = NEW."hechsherId";
  IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW."rabbanutId" THEN
    RAISE EXCEPTION 'Restaurant and hechsher must belong to the same rabbanut' USING ERRCODE = '23514';
  END IF;
  IF NEW."mashgiachId" IS NOT NULL THEN
    SELECT "rabbanutId" INTO linked_tenant FROM "mashgichim" WHERE "id" = NEW."mashgiachId";
    IF linked_tenant IS NULL OR linked_tenant IS DISTINCT FROM NEW."rabbanutId" THEN
      RAISE EXCEPTION 'Restaurant and mashgiach must belong to the same rabbanut' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER restaurants_tenant_guard
BEFORE INSERT OR UPDATE OF "rabbanutId", "hechsherId", "mashgiachId" ON "restaurants"
FOR EACH ROW EXECUTE FUNCTION enforce_restaurant_tenant_links();

CREATE OR REPLACE FUNCTION enforce_inspection_tenant_links()
RETURNS trigger AS $$
DECLARE restaurant_tenant TEXT;
DECLARE profile_tenant TEXT;
BEGIN
  IF NEW."mashgiachId" IS NOT NULL THEN
    SELECT "rabbanutId" INTO restaurant_tenant FROM "restaurants" WHERE "id" = NEW."restaurantId";
    SELECT "rabbanutId" INTO profile_tenant FROM "mashgichim" WHERE "id" = NEW."mashgiachId";
    IF restaurant_tenant IS NULL OR profile_tenant IS NULL OR restaurant_tenant IS DISTINCT FROM profile_tenant THEN
      RAISE EXCEPTION 'Inspection restaurant and mashgiach must belong to the same rabbanut' USING ERRCODE = '23514';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER inspections_tenant_guard
BEFORE INSERT OR UPDATE OF "restaurantId", "mashgiachId" ON "inspections"
FOR EACH ROW EXECUTE FUNCTION enforce_inspection_tenant_links();

CREATE OR REPLACE FUNCTION enforce_mashgiach_hechsher_tenant()
RETURNS trigger AS $$
DECLARE mashgiach_tenant TEXT;
DECLARE hechsher_tenant TEXT;
BEGIN
  SELECT "rabbanutId" INTO mashgiach_tenant FROM "mashgichim" WHERE "id" = NEW."mashgiachId";
  SELECT "rabbanutId" INTO hechsher_tenant FROM "hechsherim" WHERE "id" = NEW."hechsherId";
  IF mashgiach_tenant IS NULL OR hechsher_tenant IS NULL OR mashgiach_tenant IS DISTINCT FROM hechsher_tenant THEN
    RAISE EXCEPTION 'Mashgiach and hechsher must belong to the same rabbanut' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mashgiach_hechsher_tenant_guard
BEFORE INSERT OR UPDATE ON "mashgiach_hechsher"
FOR EACH ROW EXECUTE FUNCTION enforce_mashgiach_hechsher_tenant();

-- Prevent tenant moves that would invalidate already-linked rows. Callers must
-- detach or reassign dependants first, making cross-tenant transitions explicit.
CREATE OR REPLACE FUNCTION prevent_inconsistent_mashgiach_move()
RETURNS trigger AS $$
BEGIN
  IF NEW."rabbanutId" IS DISTINCT FROM OLD."rabbanutId" AND (
    EXISTS (SELECT 1 FROM "users" u WHERE u."mashgiachId" = OLD."id" AND u."rabbanutId" IS DISTINCT FROM NEW."rabbanutId") OR
    EXISTS (SELECT 1 FROM "restaurants" r WHERE r."mashgiachId" = OLD."id" AND r."rabbanutId" IS DISTINCT FROM NEW."rabbanutId") OR
    EXISTS (
      SELECT 1 FROM "inspections" i
      JOIN "restaurants" r ON r."id" = i."restaurantId"
      WHERE i."mashgiachId" = OLD."id" AND r."rabbanutId" IS DISTINCT FROM NEW."rabbanutId"
    ) OR
    EXISTS (
      SELECT 1 FROM "mashgiach_hechsher" mh
      JOIN "hechsherim" h ON h."id" = mh."hechsherId"
      WHERE mh."mashgiachId" = OLD."id" AND h."rabbanutId" IS DISTINCT FROM NEW."rabbanutId"
    )
  ) THEN
    RAISE EXCEPTION 'Cannot move a mashgiach while cross-tenant dependants remain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER mashgichim_tenant_move_guard
BEFORE UPDATE OF "rabbanutId" ON "mashgichim"
FOR EACH ROW EXECUTE FUNCTION prevent_inconsistent_mashgiach_move();

CREATE OR REPLACE FUNCTION prevent_inconsistent_hechsher_move()
RETURNS trigger AS $$
BEGIN
  IF NEW."rabbanutId" IS DISTINCT FROM OLD."rabbanutId" AND (
    EXISTS (SELECT 1 FROM "restaurants" r WHERE r."hechsherId" = OLD."id" AND r."rabbanutId" IS DISTINCT FROM NEW."rabbanutId") OR
    EXISTS (
      SELECT 1 FROM "mashgiach_hechsher" mh
      JOIN "mashgichim" m ON m."id" = mh."mashgiachId"
      WHERE mh."hechsherId" = OLD."id" AND m."rabbanutId" IS DISTINCT FROM NEW."rabbanutId"
    )
  ) THEN
    RAISE EXCEPTION 'Cannot move a hechsher while cross-tenant dependants remain' USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER hechsherim_tenant_move_guard
BEFORE UPDATE OF "rabbanutId" ON "hechsherim"
FOR EACH ROW EXECUTE FUNCTION prevent_inconsistent_hechsher_move();
