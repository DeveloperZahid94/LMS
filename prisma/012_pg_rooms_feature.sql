-- 012_pg_rooms_feature.sql
-- Add the PG_ROOMS feature flag so SuperAdmin can control the PG Rooms menu per tenant.
-- NOTE: Postgres requires a new enum value to be committed before it can be used,
-- so the backfill INSERT lives in a SEPARATE migration (013_pg_rooms_seed.sql) and
-- must run as its own transaction/command, after this one.

ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'PG_ROOMS';
