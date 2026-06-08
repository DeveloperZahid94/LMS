-- 027_tiffin_balance.sql
-- Tiffin-specific money tracking: amount paid toward the tiffin and a signed
-- balance (>0 due, <0 advance) independent of the student's overall account.
-- Idempotent.

ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "balance"    DECIMAL(10,2) NOT NULL DEFAULT 0;
