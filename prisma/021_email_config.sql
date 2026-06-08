-- 021_email_config.sql
-- Per-tenant email integration (Brevo / SendGrid), configured by SuperAdmin. Idempotent.

CREATE TABLE IF NOT EXISTS "email_configs" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "provider"       TEXT NOT NULL DEFAULT 'NONE',
    "brevoApiKey"    TEXT,
    "sendgridApiKey" TEXT,
    "fromEmail"      TEXT,
    "fromName"       TEXT,
    "enabled"        BOOLEAN NOT NULL DEFAULT false,
    "updatedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "email_configs_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "email_configs_tenantId_key" ON "email_configs" ("tenantId");

DO $$ BEGIN
    ALTER TABLE "email_configs"
        ADD CONSTRAINT "email_configs_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
