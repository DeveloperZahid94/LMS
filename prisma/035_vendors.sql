-- 035_vendors.sql
-- Per-tenant vendor master — the "paid to" parties on expenses (landlord, electricity
-- board, suppliers…). Holds contact/billing detail so the list is reusable across
-- expenses and can later carry advance balances. Managed under Settings → Vendors and
-- offered as a dropdown (with inline add) on the expense form.
-- Idempotent.

CREATE TABLE IF NOT EXISTS "vendors" (
    "id"            TEXT NOT NULL,
    "tenantId"      TEXT NOT NULL,
    "name"          TEXT NOT NULL,
    "contactPerson" TEXT,
    "phone"         TEXT,
    "email"         TEXT,
    "gstNumber"     TEXT,
    "address"       TEXT,
    "notes"         TEXT,
    "isActive"      BOOLEAN NOT NULL DEFAULT true,
    "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "vendors_tenantId_name_key" ON "vendors" ("tenantId", "name");
CREATE INDEX IF NOT EXISTS "vendors_tenantId_idx" ON "vendors" ("tenantId");

DO $$ BEGIN
    ALTER TABLE "vendors"
        ADD CONSTRAINT "vendors_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
