-- 036_vendor_advances.sql
-- Vendor advance "wallet": prepay a vendor and draw the balance down against future
-- expenses for that vendor.
--   * vendors.advanceBalance — remaining prepaid amount held with the vendor.
--   * expenses.vendorId       — links an expense to a Vendor (enables draw-down + filtering).
--   * expenses.advanceApplied — how much of the expense was covered from the vendor advance.
-- Expense outstanding becomes: amount - paidAmount - advanceApplied.
-- Idempotent.

ALTER TABLE "vendors"  ADD COLUMN IF NOT EXISTS "advanceBalance"  DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "vendorId"        TEXT;
ALTER TABLE "expenses" ADD COLUMN IF NOT EXISTS "advanceApplied"  DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS "expenses_tenantId_vendorId_idx" ON "expenses" ("tenantId", "vendorId");

-- Link expenses to the vendor master (keep the row if a vendor is deleted).
DO $$ BEGIN
    ALTER TABLE "expenses"
        ADD CONSTRAINT "expenses_vendorId_fkey"
        FOREIGN KEY ("vendorId") REFERENCES "vendors" ("id") ON DELETE SET NULL;
EXCEPTION WHEN duplicate_object THEN null; END $$;
