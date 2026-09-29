-- Split mashgiach profiles that are shared between rabbanuts into one profile
-- per tenant, BEFORE 20260714100000_enforce_tenant_invariants installs its
-- same-rabbanut guards.
--
-- Why: the enforce migration "repairs" legacy data by setting
-- restaurants."mashgiachId" / inspections."mashgiachId" to NULL and DELETING
-- mashgiach_hechsher rows whenever the mashgiach belongs to another rabbanut.
-- Read-only checks on production showed that this would silently wipe real
-- assignments:
--   * 485 restaurants reference a mashgiach from ANOTHER rabbanut and 8
--     mashgiach_hechsher rows are cross-tenant;
--   * the PDF importer's placeholder 'm_import_default' (own tenant
--     rb_542290b9bb4133) is assigned to 456 restaurants in 3 other tenants and
--     linked to 3 foreign hechsherim;
--   * 4 real mashgichim work for two tenants (rb_4b20b4bf49b2f0 <->
--     rb_050ad423fd1f6d) with 29 cross-tenant restaurant assignments and 5
--     cross-tenant hechsher links (one of them is linked to a hechsher of a
--     third tenant where he has no restaurants).
-- Instead of losing those links, every (mashgiach M, foreign tenant T) pair that
-- is referenced by a restaurant of T, an inspection of a restaurant of T or a
-- hechsher of T gets its own copy of M inside T, and those references are
-- repointed to the copy. The enforce migration then finds nothing to null or
-- delete.
--
-- Deterministic and idempotent:
--   * clone id = M.id || '__' || left(md5(T), 10), so re-running (or running on
--     another copy of the same data) always produces the same ids;
--   * clones are inserted with ON CONFLICT DO NOTHING;
--   * rows that are already consistent (mashgiach in the row's own rabbanut)
--     are never touched, so an empty DB or a DB without cross-tenant rows is a
--     no-op. It is also safe if 20260714100000 was already applied (dev DBs):
--     every repointed row ends up in its own tenant, which its triggers accept.
--
-- users."mashgiachId" (step 0): user accounts are never pointed at a clone by
-- this migration. It applies 20260714100000's own user-repair rules EARLIER,
-- on the pre-split data, because the clones copy names into foreign tenants and
-- would otherwise make 20260714100000's "only one same-name profile in the
-- tenant" match ambiguous (-> 'Unmapped mashgiach users remain'). What is still
-- unlinked after step 0 is left to 20260714100000 as before, with one
-- deliberate difference: its name match now also sees the clones, so a
-- mashgiach user with no profile of their own is linked to the clone of the
-- same-named person who serves their tenant (without the split that
-- migration would abort and demand a manual mapping). Two same-named
-- candidates still abort it. Prod has 0 mashgiach users.
--
-- A clone is always a NEW profile; an existing profile of the same person in
-- the target tenant (same email/phone, e.g. created by hand in the CRM) is not
-- reused, so the tenant then has two profiles to merge in the CRM. Pre-deploy
-- read-only check for such pairs:
--   SELECT DISTINCT m."id" AS source_id, x."id" AS existing_id FROM "restaurants" r
--   JOIN "mashgichim" m ON m."id" = r."mashgiachId" AND m."rabbanutId" <> r."rabbanutId"
--   JOIN "mashgichim" x ON x."rabbanutId" = r."rabbanutId" AND x."id" <> m."id"
--    AND (lower(x."email") = lower(m."email") OR (m."phone" <> '' AND x."phone" = m."phone"));
-- (repeat with inspections -> restaurants and mashgiach_hechsher -> hechsherim).
--
-- The clone copies name/phone/email/area/active; "updatedAt" has no DB default
-- (Prisma @updatedAt), so it is set explicitly. Repointed restaurants and
-- inspections keep their "updatedAt": only the profile row behind the same
-- person changes, not anything visible on the record.
--
-- The PDF importer (scripts/import-pdf-data.ts, src/lib/mashgiachTenancy.ts)
-- derives the same clone ids, so a re-import lands on these rows.

-- 0. Resolve user -> profile links before any clone exists, with the same
--    rules as 20260714100000 (no-ops once that migration is applied: its
--    trigger keeps every link same-tenant). A profile matched by two unlinked
--    users is skipped here (users."mashgiachId" is UNIQUE) and left to it.
UPDATE "users" AS u
SET "mashgiachId" = NULL
FROM "mashgichim" AS m
WHERE u."mashgiachId" = m."id"
  AND (u."role" <> 'mashgiach' OR u."rabbanutId" IS DISTINCT FROM m."rabbanutId");

UPDATE "users"
SET "mashgiachId" = NULL
WHERE "role" <> 'mashgiach' AND "mashgiachId" IS NOT NULL;

WITH unique_name_matches AS (
  SELECT u."id" AS user_id, MIN(m."id") AS mashgiach_id
  FROM "users" AS u
  JOIN "mashgichim" AS m
    ON m."rabbanutId" = u."rabbanutId"
   AND lower(btrim(m."name")) = lower(btrim(u."name"))
  WHERE u."role" = 'mashgiach' AND u."mashgiachId" IS NULL
  GROUP BY u."id"
  HAVING COUNT(*) = 1
), claimable AS (
  SELECT x.user_id, x.mashgiach_id
  FROM unique_name_matches AS x
  WHERE NOT EXISTS (SELECT 1 FROM "users" AS o WHERE o."mashgiachId" = x.mashgiach_id)
    AND NOT EXISTS (
      SELECT 1 FROM unique_name_matches AS y
      WHERE y.mashgiach_id = x.mashgiach_id AND y.user_id <> x.user_id
    )
)
UPDATE "users" AS u
SET "mashgiachId" = c.mashgiach_id
FROM claimable AS c
WHERE u."id" = c.user_id;

-- 1. Every (mashgiach, foreign tenant) pair that is referenced anywhere.
CREATE TEMP TABLE "_split_mashgiach_tenant" AS
SELECT DISTINCT
  m."id"                                        AS source_id,
  refs.tenant_id                                AS tenant_id,
  m."id" || '__' || left(md5(refs.tenant_id), 10) AS clone_id
FROM (
  SELECT r."mashgiachId" AS mashgiach_id, r."rabbanutId" AS tenant_id
  FROM "restaurants" AS r
  WHERE r."mashgiachId" IS NOT NULL
  UNION
  SELECT i."mashgiachId", r."rabbanutId"
  FROM "inspections" AS i
  JOIN "restaurants" AS r ON r."id" = i."restaurantId"
  WHERE i."mashgiachId" IS NOT NULL
  UNION
  SELECT mh."mashgiachId", h."rabbanutId"
  FROM "mashgiach_hechsher" AS mh
  JOIN "hechsherim" AS h ON h."id" = mh."hechsherId"
) AS refs
JOIN "mashgichim" AS m ON m."id" = refs.mashgiach_id
WHERE m."rabbanutId" IS DISTINCT FROM refs.tenant_id;

-- 2. One clone of the profile per foreign tenant.
INSERT INTO "mashgichim"
  ("id", "name", "phone", "email", "area", "active", "rabbanutId", "createdAt", "updatedAt")
SELECT s.clone_id, m."name", m."phone", m."email", m."area", m."active", s.tenant_id, now(), now()
FROM "_split_mashgiach_tenant" AS s
JOIN "mashgichim" AS m ON m."id" = s.source_id
ORDER BY s.clone_id
ON CONFLICT ("id") DO NOTHING;

-- A pre-existing row with a clone id but a different tenant would make the
-- repointing below cross-tenant again; refuse instead of guessing.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "_split_mashgiach_tenant" AS s
    LEFT JOIN "mashgichim" AS c ON c."id" = s.clone_id
    WHERE c."id" IS NULL OR c."rabbanutId" IS DISTINCT FROM s.tenant_id
  ) THEN
    RAISE EXCEPTION
      'A mashgichim row with a split-clone id exists in the wrong rabbanut. Resolve it manually and rerun migrations.';
  END IF;
END $$;

-- 3. Repoint restaurants and inspections of tenant T to the clone in T.
UPDATE "restaurants" AS r
SET "mashgiachId" = s.clone_id
FROM "_split_mashgiach_tenant" AS s
WHERE r."mashgiachId" = s.source_id
  AND r."rabbanutId" = s.tenant_id;

UPDATE "inspections" AS i
SET "mashgiachId" = s.clone_id
FROM "restaurants" AS r, "_split_mashgiach_tenant" AS s
WHERE i."restaurantId" = r."id"
  AND i."mashgiachId" = s.source_id
  AND r."rabbanutId" = s.tenant_id;

-- 4. Move cross-tenant hechsher links from the original to the clone.
INSERT INTO "mashgiach_hechsher" ("mashgiachId", "hechsherId")
SELECT s.clone_id, mh."hechsherId"
FROM "mashgiach_hechsher" AS mh
JOIN "hechsherim" AS h ON h."id" = mh."hechsherId"
JOIN "_split_mashgiach_tenant" AS s
  ON s.source_id = mh."mashgiachId"
 AND s.tenant_id = h."rabbanutId"
ON CONFLICT ("mashgiachId", "hechsherId") DO NOTHING;

DELETE FROM "mashgiach_hechsher" AS mh
USING "hechsherim" AS h, "_split_mashgiach_tenant" AS s
WHERE mh."hechsherId" = h."id"
  AND mh."mashgiachId" = s.source_id
  AND h."rabbanutId" = s.tenant_id;

-- 5. Nothing may be left for 20260714100000 to null or delete.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM "restaurants" AS r
    JOIN "mashgichim" AS m ON m."id" = r."mashgiachId"
    WHERE r."rabbanutId" IS DISTINCT FROM m."rabbanutId"
  ) OR EXISTS (
    SELECT 1
    FROM "inspections" AS i
    JOIN "restaurants" AS r ON r."id" = i."restaurantId"
    JOIN "mashgichim" AS m ON m."id" = i."mashgiachId"
    WHERE r."rabbanutId" IS DISTINCT FROM m."rabbanutId"
  ) OR EXISTS (
    SELECT 1
    FROM "mashgiach_hechsher" AS mh
    JOIN "mashgichim" AS m ON m."id" = mh."mashgiachId"
    JOIN "hechsherim" AS h ON h."id" = mh."hechsherId"
    WHERE m."rabbanutId" IS DISTINCT FROM h."rabbanutId"
  ) THEN
    RAISE EXCEPTION
      'Cross-tenant mashgiach references remain after the split. Inspect them and rerun migrations.';
  END IF;
END $$;

DROP TABLE "_split_mashgiach_tenant";
