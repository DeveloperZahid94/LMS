-- 034_student_ledger_reset.sql
-- Supports clean reactivation accounting. A student's outstandingBalance is DERIVED
-- (expected − paid − discount over their payments). When a left student returns we start
-- a fresh "stint": "ledgerResetAt" marks the cutoff so the derived balance ignores the
-- previous stint's payments/discounts (otherwise old payments would wrongly credit the
-- new balance). The prior leaving due is then either waived (recorded as a discount in the
-- old period) or carried forward (a discount adjustment in the new period).
-- Idempotent.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "ledgerResetAt" TIMESTAMP(3);
