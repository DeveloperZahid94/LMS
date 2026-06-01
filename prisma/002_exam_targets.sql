-- ============================================================================
-- LMS Platform — migration 002: per-tenant exam targets
--
-- Adds the `exam_targets` table so each tenant can curate a list of exam
-- categories shown in the student form. Users can also add new exams on the
-- fly via the UI (isCustom = TRUE).
--
-- USAGE (against a database that already has init.sql applied)
--   psql -d lms -f prisma/002_exam_targets.sql
--
-- IDEMPOTENT — uses IF NOT EXISTS / ON CONFLICT throughout.
--
-- Convention going forward: every schema change ships as a new numbered
-- script (003_xxx.sql, 004_xxx.sql, ...). init.sql is the implicit 001.
-- ============================================================================

CREATE TABLE IF NOT EXISTS "exam_targets" (
    "id"        TEXT NOT NULL,
    "tenantId"  TEXT NOT NULL,
    "name"      TEXT NOT NULL,
    "isCustom"  BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "exam_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "exam_targets_tenantId_name_key"
    ON "exam_targets" ("tenantId", "name");

CREATE INDEX IF NOT EXISTS "exam_targets_tenantId_idx"
    ON "exam_targets" ("tenantId");

-- Add FK only if it doesn't already exist (Postgres has no IF NOT EXISTS for
-- ADD CONSTRAINT pre-15, so use a DO block).
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'exam_targets_tenantId_fkey'
    ) THEN
        ALTER TABLE "exam_targets"
            ADD CONSTRAINT "exam_targets_tenantId_fkey"
            FOREIGN KEY ("tenantId") REFERENCES "tenants"("id")
            ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- ----------------------------------------------------------------------------
-- Seed default exam targets for every existing tenant
-- ----------------------------------------------------------------------------
INSERT INTO "exam_targets" (id, "tenantId", name, "isCustom", "createdAt")
SELECT gen_random_uuid(), t.id, e.name, FALSE, NOW()
FROM "tenants" t
CROSS JOIN (VALUES
  ('UPSC'), ('SSC'), ('Banking'), ('RRB'), ('NEET'), ('JEE'),
  ('CA'), ('CAT'), ('GATE'), ('State PSC'), ('Other')
) AS e(name)
ON CONFLICT ("tenantId", name) DO NOTHING;
