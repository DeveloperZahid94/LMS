
-- ============================================================================
-- LMS Platform — migration 004: seat per-shift rates + notes
--
-- Adds two columns to `seats`:
--   - monthlyRates  JSONB   per-shift INR pricing, e.g.
--                           { "MORNING": 800, "AFTERNOON": 800, "FULL_DAY": 1500 }
--   - notes         TEXT    free-form admin notes (orientation, special amenities…)
--
-- USAGE (against a database that already has init.sql + 002 + 003 applied)
--   psql -d lms -f prisma/004_seat_rates_and_notes.sql
--
-- IDEMPOTENT — uses ADD COLUMN IF NOT EXISTS.
-- ============================================================================

ALTER TABLE "seats" ADD COLUMN IF NOT EXISTS "monthlyRates" JSONB;
ALTER TABLE "seats" ADD COLUMN IF NOT EXISTS "notes"        TEXT;

-- Optional: seed sensible defaults on existing rows so the UI has something
-- to show. Cabins get a higher rate; regular seats and hot desks lower.
-- Skips rows that already have a rate set.
UPDATE "seats"
   SET "monthlyRates" = CASE "type"::TEXT
     WHEN 'CABIN'    THEN '{ "MORNING": 1500, "AFTERNOON": 1500, "EVENING": 1500, "NIGHT": 1500, "FULL_DAY": 3000 }'::jsonb
     WHEN 'HOT_DESK' THEN '{ "MORNING": 500,  "AFTERNOON": 500,  "EVENING": 500,  "NIGHT": 500,  "FULL_DAY": 1200 }'::jsonb
     ELSE                 '{ "MORNING": 800,  "AFTERNOON": 800,  "EVENING": 800,  "NIGHT": 800,  "FULL_DAY": 1500 }'::jsonb
   END
 WHERE "monthlyRates" IS NULL;

