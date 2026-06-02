-- 015_menu_features_seed.sql
-- Backfill the new menu-visibility flags for every existing tenant (enabled = true),
-- so current behaviour is unchanged until a SuperAdmin turns one off. Idempotent.
-- Run AFTER 014_menu_features.sql has committed.

INSERT INTO "feature_flags" ("id", "tenantId", "key", "enabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", k.key::"FeatureKey", true, NOW(), NOW()
  FROM "tenants" t
  CROSS JOIN (VALUES ('DASHBOARD'), ('STUDENTS'), ('SEATS'), ('ALERTS'), ('SETTINGS')) AS k(key)
ON CONFLICT ("tenantId", "key") DO NOTHING;
