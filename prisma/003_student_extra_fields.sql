-- ============================================================================
-- LMS Platform — migration 003: extra student profile fields
--
-- Adds India-specific KYC, family/emergency, address split, exam target, and
-- membership expiry to the `students` table. Replaces the single `address`
-- column with `permanentAddress` + `temporaryAddress`.
--
-- USAGE (against a database that already has init.sql + 002 applied)
--   psql -d lms -f prisma/003_student_extra_fields.sql
--
-- IDEMPOTENT — uses ADD COLUMN IF NOT EXISTS / DROP COLUMN IF EXISTS.
--
-- ⚠️  DATA NOTE
--   The legacy `address` column is migrated to `temporaryAddress` before being
--   dropped, so no data is lost. If you already ran `prisma db push`
--   previously, the columns are present and this script is a no-op.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- KYC
-- ----------------------------------------------------------------------------
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "aadhaarNumber"    TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "voterId"          TEXT;

-- ----------------------------------------------------------------------------
-- Family / emergency
-- ----------------------------------------------------------------------------
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "fatherName"       TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "motherName"       TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "emergencyContact" TEXT;

-- ----------------------------------------------------------------------------
-- Addresses (split — permanent home + current/temporary)
-- ----------------------------------------------------------------------------
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "permanentAddress" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "temporaryAddress" TEXT;

-- ----------------------------------------------------------------------------
-- Academic
-- ----------------------------------------------------------------------------
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "examTarget"       TEXT;

-- ----------------------------------------------------------------------------
-- Membership expiry
-- ----------------------------------------------------------------------------
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "expiresAt"        TIMESTAMP(3);

-- ----------------------------------------------------------------------------
-- Migrate legacy `address` -> `temporaryAddress`, then drop the old column.
-- Wrapped in a DO block so we only attempt the copy if `address` still exists.
-- ----------------------------------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'students' AND column_name = 'address'
    ) THEN
        UPDATE "students"
            SET "temporaryAddress" = "address"
          WHERE "temporaryAddress" IS NULL AND "address" IS NOT NULL;

        ALTER TABLE "students" DROP COLUMN "address";
    END IF;
END $$;
