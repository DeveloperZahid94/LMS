-- ============================================================================
-- LMS Platform — migration 005: seat-assignment status + monthlyRate snapshot
--
-- Replaces the simple `isActive` boolean on seat_assignments with a 3-state
-- enum so we can distinguish "temporary" (held but unpaid) from "confirmed"
-- (>=50% of monthly fee paid). Also snapshots the seat's monthlyRate at
-- allocation time so subsequent rate changes don't move the threshold.
--
-- USAGE
--   psql -d lms -f prisma/005_seat_assignment_status.sql
--
-- IDEMPOTENT — guarded with DO blocks that check for prior state.
-- ============================================================================

-- 1. Enum type
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'SeatAssignmentStatus') THEN
        CREATE TYPE "SeatAssignmentStatus" AS ENUM ('TEMPORARY', 'CONFIRMED', 'ENDED');
    END IF;
END $$;

-- 2. New columns (status + monthlyRate snapshot)
ALTER TABLE "seat_assignments"
    ADD COLUMN IF NOT EXISTS "status" "SeatAssignmentStatus" NOT NULL DEFAULT 'TEMPORARY';
ALTER TABLE "seat_assignments"
    ADD COLUMN IF NOT EXISTS "monthlyRate" DECIMAL(10,2);

-- 3. Back-fill status from legacy isActive (only if isActive still exists)
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'seat_assignments' AND column_name = 'isActive'
    ) THEN
        UPDATE "seat_assignments" SET "status" = 'TEMPORARY' WHERE "isActive" = TRUE;
        UPDATE "seat_assignments" SET "status" = 'ENDED'     WHERE "isActive" = FALSE;
        ALTER TABLE "seat_assignments" DROP COLUMN "isActive";
    END IF;
END $$;

-- 4. Replace old (… , isActive) indexes with (… , status) ones
DROP INDEX IF EXISTS "seat_assignments_tenantId_seatId_isActive_idx";
DROP INDEX IF EXISTS "seat_assignments_tenantId_studentId_isActive_idx";

CREATE INDEX IF NOT EXISTS "seat_assignments_tenantId_seatId_status_idx"
    ON "seat_assignments" ("tenantId", "seatId", "status");
CREATE INDEX IF NOT EXISTS "seat_assignments_tenantId_studentId_status_idx"
    ON "seat_assignments" ("tenantId", "studentId", "status");

-- 5. Best-effort back-fill of monthlyRate for existing assignments using the
--    seat's current monthlyRates JSON. Only fills rows where it's NULL.
UPDATE "seat_assignments" sa
   SET "monthlyRate" = ( s."monthlyRates" ->> sa."shift"::text )::numeric
  FROM "seats" s
 WHERE sa."seatId" = s."id"
   AND sa."monthlyRate" IS NULL
   AND s."monthlyRates" IS NOT NULL
   AND ( s."monthlyRates" ->> sa."shift"::text ) IS NOT NULL;
