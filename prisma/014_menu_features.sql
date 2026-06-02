-- 014_menu_features.sql
-- Make the remaining core sidebar items controllable per tenant by adding
-- menu-visibility feature flags. Backfill lives in 015_menu_features_seed.sql
-- (a new enum value can't be used in the same transaction that adds it).

ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'DASHBOARD';
ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'STUDENTS';
ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'SEATS';
ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'ALERTS';
ALTER TYPE "FeatureKey" ADD VALUE IF NOT EXISTS 'SETTINGS';
