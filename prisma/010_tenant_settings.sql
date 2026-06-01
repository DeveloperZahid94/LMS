-- ============================================================================
-- LMS Platform — migration 010: per-tenant settings JSON store
--
-- A single row per tenant holding a flexible JSON blob for Settings-screen
-- preferences (SMS provider config, biometric device, backup schedule,
-- security policy, etc.). Keeping it in a JSON column avoids a schema
-- migration every time we expose a new toggle.
--
-- USAGE
--   psql -d lms -f prisma/010_tenant_settings.sql
-- IDEMPOTENT.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "tenant_settings" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "data"      JSONB NOT NULL DEFAULT '{}'::jsonb,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tenant_settings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "tenant_settings_tenantId_key"
    ON "tenant_settings" ("tenantId");

DO $$ BEGIN
    ALTER TABLE "tenant_settings"
        ADD CONSTRAINT "tenant_settings_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
