-- 020_payment_soft_delete.sql
-- Soft-delete for payments: deleted rows are kept for audit but hidden from all
-- lists and excluded from totals. A reason is required when deleting. Idempotent.

ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedAt"     TIMESTAMP(3);
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedReason" TEXT;
ALTER TABLE "payments" ADD COLUMN IF NOT EXISTS "deletedById"   TEXT;

CREATE INDEX IF NOT EXISTS "payments_tenantId_deletedAt_idx" ON "payments" ("tenantId", "deletedAt");
