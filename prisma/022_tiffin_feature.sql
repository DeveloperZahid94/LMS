-- 022_tiffin_feature.sql
-- Add the TIFFIN feature flag so SuperAdmin can control the Tiffin add-on per tenant.
-- NOTE: Postgres requires a new enum value to be committed before it can be used,
-- so the backfill INSERT lives in a SEPARATE migration (023_tiffin.sql) and must
-- run as its own transaction/command, after this one.

ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'TIFFIN';
