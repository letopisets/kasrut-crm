-- Future password resets increment this value, invalidating older map JWTs.
ALTER TABLE "map_users"
ADD COLUMN "sessionVersion" INTEGER NOT NULL DEFAULT 0;
