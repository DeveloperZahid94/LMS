-- ============================================================================
-- LMS Platform — migration 006: next-installment due date on seat assignments
--
-- Adds `nextDueDate TIMESTAMP(3)` to `seat_assignments` so staff can record
-- when the student's next installment is expected. The Alerts screen and the
-- ⚠️ overdue badges on the Seats grid both read this column.
--
-- USAGE
--   psql -d lms -f prisma/006_seat_assignment_due_date.sql
--
-- IDEMPOTENT — ADD COLUMN IF NOT EXISTS + CREATE INDEX IF NOT EXISTS.
-- ============================================================================

ALTER TABLE "seat_assignments"
    ADD COLUMN IF NOT EXISTS "nextDueDate" TIMESTAMP(3);

CREATE INDEX IF NOT EXISTS "seat_assignments_tenantId_nextDueDate_idx"
    ON "seat_assignments" ("tenantId", "nextDueDate");
