-- 018_self_checkin.sql
-- Student self check-in/out: capture geolocation + selfie for both in and out,
-- and add a SELF attendance source. Idempotent.

ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkInLat"        DOUBLE PRECISION;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkInLng"        DOUBLE PRECISION;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkInSelfieUrl"  TEXT;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkOutLat"       DOUBLE PRECISION;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkOutLng"       DOUBLE PRECISION;
ALTER TABLE "attendance" ADD COLUMN IF NOT EXISTS "checkOutSelfieUrl" TEXT;

ALTER TYPE "AttendanceSource" ADD VALUE IF NOT EXISTS 'SELF';
