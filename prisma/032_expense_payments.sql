-- 032_expense_payments.sql
-- Itemised ledger of payments made against a (credit) expense. A single expense can be
-- settled over several partial payments, each with its own amount, method, notes and date.
-- The expense's running "paidAmount" stays the source of truth for status; this table is
-- the history behind it.
-- Idempotent.

CREATE TABLE IF NOT EXISTS "expense_payments" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,                                   -- denormalised for tenant-scoped queries
    "expenseId"     TEXT NOT NULL,
    "amount"        DECIMAL(10,2) NOT NULL,
    "paymentMethod" TEXT,                                           -- CASH | UPI | NETBANKING | CARD | CHEQUE
    "notes"         TEXT,
    "paidDate"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expense_payments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expense_payments_tenantId_expenseId_idx" ON "expense_payments" ("tenantId", "expenseId");
CREATE INDEX IF NOT EXISTS "expense_payments_expenseId_paidDate_idx" ON "expense_payments" ("expenseId", "paidDate");

-- ---- Foreign key (cascade so payments vanish with their expense) ----
DO $$ BEGIN
    ALTER TABLE "expense_payments"
        ADD CONSTRAINT "expense_payments_expenseId_fkey"
        FOREIGN KEY ("expenseId") REFERENCES "expenses" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
