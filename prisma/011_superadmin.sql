-- 011_superadmin.sql
-- SuperAdmin console: password-reset tracking on tenant users + richer audit logging.
-- Idempotent — safe to re-run (mirrors the IF NOT EXISTS style of 010_tenant_settings.sql).

-- ---------------------------------------------------------------------------
-- users: force-change + reset tracking
-- ---------------------------------------------------------------------------
ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "users"
    ADD COLUMN IF NOT EXISTS "passwordChangedAt" TIMESTAMP(3);

-- ---------------------------------------------------------------------------
-- audit_logs: allow platform-level (tenant-less) entries + HTTP metadata
-- ---------------------------------------------------------------------------
ALTER TABLE "audit_logs" ALTER COLUMN "tenantId" DROP NOT NULL;

ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "method"     TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "path"       TEXT;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "statusCode" INTEGER;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "durationMs" INTEGER;
ALTER TABLE "audit_logs" ADD COLUMN IF NOT EXISTS "actorType"  TEXT;

CREATE INDEX IF NOT EXISTS "audit_logs_createdAt_idx"
    ON "audit_logs" ("createdAt");
