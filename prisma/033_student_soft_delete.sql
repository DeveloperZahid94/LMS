-- 033_student_soft_delete.sql
-- Turns student deletion into a soft delete so a student who leaves can later be
-- reactivated (instead of re-registered from scratch):
--   * New StudentStatus value 'LEFT' — marks a left/soft-deleted student. Their row and
--     full history (payments, attendance, docs) are retained but hidden from normal lists.
--   * "leftAt" — timestamp set when the student left; cleared on reactivation.
-- Idempotent. Note: students hard-deleted before this migration are already gone.

-- ---- Add the LEFT enum value (no-op if already present) ----
ALTER TYPE "StudentStatus" ADD VALUE IF NOT EXISTS 'LEFT';

-- ---- Add the leftAt column ----
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "leftAt" TIMESTAMP(3);
