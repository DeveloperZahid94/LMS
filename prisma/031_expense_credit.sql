-- 031_expense_credit.sql
-- Lets an expense be recorded "on credit" (pay-later) instead of paid in full.
--   * paymentStatus — PAID (settled), PARTIAL (partly paid), UNPAID (on credit, nothing paid).
--   * paidAmount    — how much has been paid so far; outstanding = amount - paidAmount.
--   * dueDate       — when the credit is due to be cleared.
--   * paidDate      — when the expense was fully settled.
-- Existing rows are back-filled as PAID with paidAmount = amount (they were always paid in full).
-- Idempotent.

-- ---- Enum (brand-new type: safe to CREATE) ----
DO $$ BEGIN
    CREATE TYPE "ExpensePaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- Columns ----
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paymentStatus" "ExpensePaymentStatus" NOT NULL DEFAULT 'PAID';
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paidAmount"    DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "dueDate"       TIMESTAMP(3);
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "paidDate"      TIMESTAMP(3);

-- ---- Back-fill: every pre-existing expense was paid in full ----
-- Only touch rows still at the default (paidAmount = 0) so re-running is a no-op.
UPDATE "expenses"
   SET "paidAmount" = "amount",
       "paidDate"   = COALESCE("paidDate", "expenseDate")
 WHERE "paymentStatus" = 'PAID' AND "paidAmount" = 0;

-- ---- Index (filter the credit list by status) ----
CREATE INDEX IF NOT EXISTS "expenses_tenantId_paymentStatus_idx" ON "expenses" ("tenantId", "paymentStatus");
