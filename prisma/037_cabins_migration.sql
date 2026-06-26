-- 037_cabins_migration.sql
-- Source: prisma/CABIN EXCEL.xlsx  (column "Cabin No")
-- Replaces ALL existing seats for the target TENANT with 145 CABINs.
-- Each cabin: type = CABIN, FULL_DAY rate = 1800, notes = 'Migration'.
--
-- Target tenant (PROD): fc12398f-6db3-4bfd-9779-544d1678a91d
--
-- WARNING: DELETE FROM seats cascades to seat_assignments (FK ON DELETE CASCADE).
--          Any existing seat assignments for this tenant will be removed.
--
-- The branch is resolved from the tenant. The scalar subquery deliberately
-- has NO "LIMIT 1": if the tenant has more than one branch, Postgres will
-- ABORT with "more than one row returned by a subquery" rather than silently
-- picking the wrong branch. (If multi-branch is expected, add an explicit
-- branch id filter below.)

BEGIN;

-- 1) Clear existing seats for the target tenant (cascades to seat_assignments)
DELETE FROM seats
WHERE "branchId" = (
  SELECT id FROM branches
  WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d'
);

-- 2) Insert cabins from the Excel "Cabin No" list
INSERT INTO seats (
  id, "tenantId", "branchId", code, type, floor,
  amenities, "monthlyRates", notes, "isActive", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(),
  b."tenantId",
  b.id,
  c.code,
  'CABIN'::"SeatType",
  'floor1',
  ARRAY[]::text[],
  '{"FULL_DAY": 1800}'::jsonb,
  'Migration',
  true,
  now(),
  now()
FROM (
  SELECT id, "tenantId"
  FROM branches
  WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d'
) b
CROSS JOIN (
  VALUES
    ('A-1'),
    ('A-2'),
    ('A-3'),
    ('A-4'),
    ('A-5'),
    ('A-6'),
    ('A-7'),
    ('A-8'),
    ('A-9'),
    ('A-10'),
    ('A-11'),
    ('A-12'),
    ('A-13'),
    ('A-14'),
    ('B-1'),
    ('B-2'),
    ('B-3'),
    ('B-4'),
    ('B-5'),
    ('B-6'),
    ('B-7'),
    ('B-8'),
    ('B-9'),
    ('B-10'),
    ('B-11'),
    ('B-12'),
    ('B-13'),
    ('B-14'),
    ('B-15'),
    ('B-16'),
    ('B-17'),
    ('B-18'),
    ('B-19'),
    ('B-20'),
    ('B-21'),
    ('B-22'),
    ('B-23'),
    ('B-24'),
    ('B-25'),
    ('B-26'),
    ('C-1'),
    ('C-2'),
    ('C-3'),
    ('C-4'),
    ('C-5'),
    ('C-6'),
    ('C-7'),
    ('C-8'),
    ('C-9'),
    ('C-10'),
    ('C-11'),
    ('C-12'),
    ('C-13'),
    ('C-14'),
    ('D-1'),
    ('D-2'),
    ('D-3'),
    ('D-4'),
    ('D-5'),
    ('D-6'),
    ('D-7'),
    ('D-8'),
    ('D-9'),
    ('D-10'),
    ('D-11'),
    ('D-12'),
    ('D-13'),
    ('D-14'),
    ('D-15'),
    ('D-16'),
    ('D-17'),
    ('D-18'),
    ('D-19'),
    ('D-20'),
    ('D-21'),
    ('D-22'),
    ('D-23'),
    ('D-24'),
    ('D-25'),
    ('D-26'),
    ('D-27'),
    ('D-28'),
    ('D-29'),
    ('D-30'),
    ('E-1'),
    ('E-2'),
    ('E-3'),
    ('E-4'),
    ('E-5'),
    ('E-6'),
    ('E-7'),
    ('E-8'),
    ('E-9'),
    ('E-10'),
    ('E-11'),
    ('E-12'),
    ('E-13'),
    ('E-14'),
    ('E-15'),
    ('E-16'),
    ('E-17'),
    ('F-1'),
    ('F-2'),
    ('F-3'),
    ('F-4'),
    ('F-5'),
    ('F-6'),
    ('F-7'),
    ('F-8'),
    ('F-9'),
    ('F-10'),
    ('F-11'),
    ('F-12'),
    ('F-13'),
    ('F-14'),
    ('F-15'),
    ('F-16'),
    ('F-17'),
    ('F-18'),
    ('F-19'),
    ('F-20'),
    ('F-21'),
    ('F-22'),
    ('F-23'),
    ('F-24'),
    ('F-25'),
    ('F-26'),
    ('F-27'),
    ('F-28'),
    ('F-29'),
    ('F-30'),
    ('F-31'),
    ('F-32'),
    ('F-33'),
    ('F-34'),
    ('F-35'),
    ('F-36'),
    ('F-37'),
    ('F-38'),
    ('F-39'),
    ('F-40'),
    ('F-41'),
    ('F-42'),
    ('F-43'),
    ('F-44')
) AS c(code);

-- 3) Sanity check (run before COMMIT, or after — should report 145)
-- SELECT count(*) FROM seats
-- WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d' AND type = 'CABIN';

COMMIT;
