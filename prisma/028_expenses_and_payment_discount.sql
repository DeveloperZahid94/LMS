-- 028_expenses_and_payment_discount.sql
-- Two additions:
--   1. Expenses — operational cost tracking (rent, salary, utilities, supplies…),
--      optionally scoped to a branch (null = tenant-wide).
--   2. Payment discounts — a concession waived alongside a payment. It reduces what
--      the student owes but is NOT counted as income (kept separate from amount).
-- Idempotent.

-- ============================================================
-- 1. EXPENSES
-- ============================================================

-- ---- Enum (brand-new type: safe to CREATE) ----
DO $$ BEGIN
    CREATE TYPE "ExpenseCategory" AS ENUM (
        'RENT', 'SALARY', 'ELECTRICITY', 'WATER', 'INTERNET',
        'MAINTENANCE', 'SUPPLIES', 'EQUIPMENT', 'MARKETING', 'MISC'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- Table ----
CREATE TABLE IF NOT EXISTS "expenses" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "branchId"      TEXT,                                            -- null = tenant-wide
    "category"      "ExpenseCategory" NOT NULL DEFAULT 'MISC',
    "title"         TEXT NOT NULL,
    "amount"        DECIMAL(10,2) NOT NULL,
    "expenseDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" TEXT,                                           -- CASH | UPI | NETBANKING | CARD | CHEQUE
    "vendor"        TEXT,
    "notes"         TEXT,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "expenses_tenantId_expenseDate_idx" ON "expenses" ("tenantId", "expenseDate");
CREATE INDEX IF NOT EXISTS "expenses_tenantId_category_idx"    ON "expenses" ("tenantId", "category");
CREATE INDEX IF NOT EXISTS "expenses_tenantId_branchId_idx"    ON "expenses" ("tenantId", "branchId");

-- ---- Foreign keys ----
DO $$ BEGIN
    ALTER TABLE "expenses"
        ADD CONSTRAINT "expenses_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "expenses"
        ADD CONSTRAINT "expenses_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- 2. PAYMENT DISCOUNTS
-- ============================================================

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discount"       DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "discountReason" TEXT;
