-- ============================================================================
-- LMS Platform — migration 009: PG Rooms (paying-guest accommodation)
--
-- Adds two new tables alongside the existing study-cabin (seats) flow so a
-- single tenant can run both a library and a PG hostel:
--   pg_rooms             — one row per physical room (Single / Double / Triple)
--   pg_room_assignments  — one row per (room, bed, student) allocation, with
--                          status ACTIVE | ENDED to keep history.
--
-- Conventions match existing tables: camelCase column names quoted, FKs to
-- tenants/branches/students cascade, soft-deletes via status enums (not actual
-- delete) so historical aggregates stay correct.
--
-- USAGE
--   psql -d lms -f prisma/009_pg_rooms.sql
--
-- IDEMPOTENT — all CREATE statements use IF NOT EXISTS guards.
-- ============================================================================

DO $$ BEGIN
    CREATE TYPE "PgRoomType" AS ENUM ('SINGLE', 'DOUBLE', 'TRIPLE');
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE "PgAssignmentStatus" AS ENUM ('ACTIVE', 'ENDED');
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS "pg_rooms" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "branchId"    TEXT NOT NULL,
    "roomNumber"  TEXT NOT NULL,
    "type"        "PgRoomType" NOT NULL DEFAULT 'SINGLE',
    "bedCount"    INTEGER NOT NULL,
    "monthlyRate" DECIMAL(10,2) NOT NULL,
    "floor"       TEXT,
    "notes"       TEXT,
    "amenities"   TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "isActive"    BOOLEAN NOT NULL DEFAULT true,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pg_rooms_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "pg_rooms_tenantId_branchId_roomNumber_key"
    ON "pg_rooms" ("tenantId", "branchId", "roomNumber");

CREATE INDEX IF NOT EXISTS "pg_rooms_tenantId_branchId_idx"
    ON "pg_rooms" ("tenantId", "branchId");

DO $$ BEGIN
    ALTER TABLE "pg_rooms"
        ADD CONSTRAINT "pg_rooms_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "pg_rooms"
        ADD CONSTRAINT "pg_rooms_branchId_fkey"
        FOREIGN KEY ("branchId") REFERENCES "branches" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;


CREATE TABLE IF NOT EXISTS "pg_room_assignments" (
    "id"          TEXT NOT NULL,
    "tenantId"    TEXT NOT NULL,
    "roomId"      TEXT NOT NULL,
    "studentId"   TEXT NOT NULL,
    "bedNumber"   INTEGER NOT NULL,
    "startDate"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endDate"     TIMESTAMP(3),
    "monthlyRate" DECIMAL(10,2),
    "nextDueDate" TIMESTAMP(3),
    "status"      "PgAssignmentStatus" NOT NULL DEFAULT 'ACTIVE',
    "notes"       TEXT,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pg_room_assignments_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "pg_room_assignments_tenantId_roomId_status_idx"
    ON "pg_room_assignments" ("tenantId", "roomId", "status");
CREATE INDEX IF NOT EXISTS "pg_room_assignments_tenantId_studentId_status_idx"
    ON "pg_room_assignments" ("tenantId", "studentId", "status");
CREATE INDEX IF NOT EXISTS "pg_room_assignments_tenantId_nextDueDate_idx"
    ON "pg_room_assignments" ("tenantId", "nextDueDate");

-- Only one ACTIVE assignment can exist per (room, bed). Implemented as a
-- partial unique index since the same (roomId, bedNumber) can re-appear once
-- the previous tenant is moved to ENDED.
CREATE UNIQUE INDEX IF NOT EXISTS "pg_room_assignments_roomId_bedNumber_active_key"
    ON "pg_room_assignments" ("roomId", "bedNumber")
    WHERE "status" = 'ACTIVE';

DO $$ BEGIN
    ALTER TABLE "pg_room_assignments"
        ADD CONSTRAINT "pg_room_assignments_tenantId_fkey"
        FOREIGN KEY ("tenantId") REFERENCES "tenants" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "pg_room_assignments"
        ADD CONSTRAINT "pg_room_assignments_roomId_fkey"
        FOREIGN KEY ("roomId") REFERENCES "pg_rooms" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "pg_room_assignments"
        ADD CONSTRAINT "pg_room_assignments_studentId_fkey"
        FOREIGN KEY ("studentId") REFERENCES "students" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
