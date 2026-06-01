-- ============================================================================
-- LMS Platform — seed data
--
-- USAGE
--   psql -d lms -f prisma/seed.sql
--
-- Run AFTER prisma/init.sql. Inserts a SuperAdmin, a demo tenant with all
-- feature flags enabled, an HQ branch, a ClientAdmin user, 20 seats, and one
-- monthly plan. Equivalent to `npm run prisma:seed`.
--
-- IDEMPOTENT — uses ON CONFLICT DO NOTHING on every row. Re-runnable safely.
--
-- All UUIDs below are RFC-4122 v4 (validated by class-validator's @IsUUID()
-- decorator on the API side). Do not replace with "pretty" repeated-digit
-- UUIDs (e.g. 11111111-1111-1111-1111-111111111111) — those fail the v4
-- structural check (version digit must be 4, variant digit must be 8/9/a/b).
--
-- Credentials seeded
--   SuperAdmin    superadmin@lms.local         / SuperAdmin@123
--   ClientAdmin   admin@demo-library.local     / Admin@123  (tenant slug: demo-library)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- PlatformAdmin (SuperAdmin)
-- bcrypt('SuperAdmin@123', 10)
-- ----------------------------------------------------------------------------
INSERT INTO "platform_admins" (id, email, "passwordHash", "fullName", "isActive", "createdAt", "updatedAt")
VALUES (
  'fd3ab17b-466d-4fba-a7e5-f31532def22b',
  'superadmin@lms.local',
  '$2a$10$hjFWQlR9j0/XLLqJSqD4aeYy/Xb/l3oHpkjWkHzlASo34wm8g4qPu',
  'Platform Super Admin',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- Demo tenant
-- ----------------------------------------------------------------------------
INSERT INTO "tenants" (id, name, slug, email, phone, status, plan, "createdAt", "updatedAt")
VALUES (
  'fc12398f-6db3-4bfd-9779-544d1678a91d',
  'Demo Library',
  'demo-library',
  'admin@demo-library.local',
  '+919999999999',
  'ACTIVE',
  'growth',
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO NOTHING;

-- ----------------------------------------------------------------------------
-- All feature flags enabled for the demo tenant
-- ----------------------------------------------------------------------------
INSERT INTO "feature_flags" (id, "tenantId", key, enabled, "createdAt", "updatedAt")
SELECT gen_random_uuid(), 'fc12398f-6db3-4bfd-9779-544d1678a91d', k::"FeatureKey", TRUE, NOW(), NOW()
FROM unnest(ARRAY[
  'QR_ATTENDANCE','WHATSAPP','REPORTS','ANALYTICS','MULTI_BRANCH','PAYMENT_GATEWAY','EXPORTS'
]) AS k
ON CONFLICT ("tenantId", key) DO NOTHING;

-- ----------------------------------------------------------------------------
-- HQ branch for the demo tenant
-- ----------------------------------------------------------------------------
INSERT INTO "branches" (id, "tenantId", name, code, city, state, "isActive", "createdAt", "updatedAt")
VALUES (
  '5939e62b-cb85-410c-89fa-f562cf890a29',
  'fc12398f-6db3-4bfd-9779-544d1678a91d',
  'Headquarters',
  'HQ',
  'Bengaluru',
  'KA',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("tenantId", code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- ClientAdmin user
-- bcrypt('Admin@123', 10)
-- ----------------------------------------------------------------------------
INSERT INTO "users" (
  id, "tenantId", "branchId", email, "passwordHash", "fullName", role, "isActive",
  "createdAt", "updatedAt"
)
VALUES (
  '2cdd1f5e-3331-48d7-a73d-f713c84670c6',
  'fc12398f-6db3-4bfd-9779-544d1678a91d',
  '5939e62b-cb85-410c-89fa-f562cf890a29',
  'admin@demo-library.local',
  '$2a$10$lOmsJKPAN1BDpKloTwzU5.3l1sejdnDs8dj1AU205pcGLgQheRdpG',
  'Demo Client Admin',
  'CLIENT_ADMIN',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT ("tenantId", email) DO NOTHING;

-- ----------------------------------------------------------------------------
-- 20 seats — first 5 are cabins, rest are regular seats. All on floor 1, AC + wifi.
-- ----------------------------------------------------------------------------
INSERT INTO "seats" (id, "tenantId", "branchId", code, type, floor, amenities, "isActive", "createdAt", "updatedAt")
SELECT
  gen_random_uuid(),
  'fc12398f-6db3-4bfd-9779-544d1678a91d',
  '5939e62b-cb85-410c-89fa-f562cf890a29',
  'A-' || LPAD(n::text, 2, '0'),
  CASE WHEN n <= 5 THEN 'CABIN'::"SeatType" ELSE 'SEAT'::"SeatType" END,
  '1',
  ARRAY['AC','wifi'],
  TRUE,
  NOW(),
  NOW()
FROM generate_series(1, 20) AS n
ON CONFLICT ("tenantId", "branchId", code) DO NOTHING;

-- ----------------------------------------------------------------------------
-- One default monthly plan
-- ----------------------------------------------------------------------------
INSERT INTO "student_plans" (
  id, "tenantId", name, price, "durationDays", shift, "isActive", "createdAt", "updatedAt"
)
VALUES (
  '8d4e2cc5-c111-4cef-9783-11c5a33af069',
  'fc12398f-6db3-4bfd-9779-544d1678a91d',
  'Monthly Full Day',
  1500.00,
  30,
  'FULL_DAY',
  TRUE,
  NOW(),
  NOW()
)
ON CONFLICT (id) DO NOTHING;
