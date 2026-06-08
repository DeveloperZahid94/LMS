-- 026_student_balance.sql
-- Track a student's outstanding balance (from part payments at registration / renewals).
-- Idempotent.

ALTER TABLE "students"
    ADD COLUMN IF NOT EXISTS "outstandingBalance" DECIMAL(10,2) NOT NULL DEFAULT 0;
