INSERT INTO "kashrut_levels" ("id", "name", "sortOrder")
VALUES ('kl_lo_mehadrin', 'Lo Mehadrin', 3)
ON CONFLICT ("id") DO NOTHING;
