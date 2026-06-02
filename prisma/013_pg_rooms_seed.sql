-- 013_pg_rooms_seed.sql
-- Backfill the PG_ROOMS feature flag for every existing tenant (enabled = true),
-- preserving current behaviour where PG Rooms is available. Idempotent.
-- Run AFTER 012_pg_rooms_feature.sql has committed.

INSERT INTO "feature_flags" ("id", "tenantId", "key", "enabled", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, t."id", 'PG_ROOMS', true, NOW(), NOW()
  FROM "tenants" t
ON CONFLICT ("tenantId", "key") DO NOTHING;
