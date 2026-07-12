-- AlterTable
-- Structured weekly hours as JSON: { "0".."6": { "open": "HH:MM", "close": "HH:MM" } | null }
-- (day 0 = Sunday). Kept alongside the free-text `hours` for display fallback.
ALTER TABLE "restaurants" ADD COLUMN "hoursJson" JSONB;
