-- 023_tiffin.sql
-- Tiffin (meal) subscriptions — a per-student add-on that can stand alone or sit
-- alongside a library cabin / PG bed. Idempotent.
-- Run AFTER 022_tiffin_feature.sql has committed (it uses the new 'TIFFIN' enum value).

-- ---- Enums (brand-new types: safe to CREATE in this transaction) ----
DO $$ BEGIN
    CREATE TYPE "TiffinMealType" AS ENUM ('VEG', 'NONVEG');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TiffinMealPlan" AS ENUM ('LUNCH', 'DINNER', 'BOTH');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "TiffinStatus" AS ENUM ('ACTIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- Table ----
CREATE TABLE IF NOT EXISTS "tiffin_subscriptions" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "branchId"    TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "mealType"    "TiffinMealType" NOT NULL DEFAULT 'VEG',
    "mealPlan"    "TiffinMealPlan" NOT NULL DEFAULT 'BOTH',
    "monthlyRate" DECIMAL(10,2) NOT NULL,
    "startDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate"     TIMESTAMP(3),
    "nextDueDate" TIMESTAMP(3),
    "status"      "TiffinStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tiffin_subscriptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tiffin_subscriptions_tenantId_studentId_status_idx"
    ON "tiffin_subscriptions" ("tenantId", "studentId", "status");
CREATE INDEX IF NOT EXISTS "tiffin_subscriptions_tenantId_nextDueDate_idx"
    ON "tiffin_subscriptions" ("tenantId", "nextDueDate");
CREATE INDEX IF NOT EXISTS "tiffin_subscriptions_tenantId_branchId_idx"
    ON "tiffin_subscriptions" ("tenantId", "branchId");

-- ---- Foreign keys ----
DO $$ BEGIN
    ALTER TABLE "tiffin_subscriptions"
        ADD CONSTRAINT "tiffin_subscriptions_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "tiffin_subscriptions"
        ADD CONSTRAINT "tiffin_subscriptions_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "tiffin_subscriptions"
        ADD CONSTRAINT "tiffin_subscriptions_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ---- Backfill the TIFFIN feature flag for every existing tenant (enabled = true) ----
INSERT INTO "feature_flags" ("id", "tenantId", "key", "enabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'TIFFIN', true, NOW(), NOW()
  FROM "tenants" t
ON CONFLICT ("tenantId", "key") DO NOTHING;
