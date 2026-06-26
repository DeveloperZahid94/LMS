-- 038_cabin_seat_allocation.sql
-- Source: prisma/CABIN EXCEL.xlsx  (columns: Cabin No, NAME, COURSE, FEE FROM, FEE TO)
-- Allocates the 73 named occupants to their cabins for tenant:
--     fc12398f-6db3-4bfd-9779-544d1678a91d
--
-- Behaviour:
--   * Matches each Excel NAME to an EXISTING student (case/space-insensitive).
--   * Creates a CONFIRMED, FULL_DAY seat_assignment per matched (cabin, student):
--     startDate = FEE FROM, endDate = nextDueDate = FEE TO, monthlyRate = 1800.
--   * Creates a PAID cash payment of 1800 (purpose SEAT) per student so the
--     derived balance shows fully paid (expected = 1 x monthlyRate = 1800).
--     Payment notes capture course + fee period, e.g.
--       'Migration | NEET PG | 2026-06-05..2026-07-04'
--   * Recomputes students.outstandingBalance for all students of the tenant.
--   * SKIPS B-12 (ARIF MANSOOR, remark 'LEFT').
--
-- NOTE: seat_assignments has no notes column, so course/period live on the
--       payment row's notes field.
--
-- PREREQUISITE: 037_cabins_migration.sql must already be applied (cabins with
--               these codes must exist for this tenant's branch).
--
-- Name match key = upper + trim + collapsed internal whitespace, both sides.
-- Names not matching exactly one student are skipped by the INNER JOINs.
-- RUN STEP 0 (read-only) FIRST to catch those before writing.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 0  (READ-ONLY DRY RUN) -- run this statement on its own first.
-- Expect every row: student_matches = 1 AND cabin_found = 1.
-- ---------------------------------------------------------------------
WITH roster(cabin, sname, course, dfrom, dto) AS ( VALUES
    ('A-1', 'MARIA HILAL', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('A-5', 'ZAMREEN', 'NEET – PG', DATE '2026-05-14', DATE '2026-07-13'),
    ('A-6', 'AZKA', 'UPSC', DATE '2026-06-05', DATE '2026-07-04'),
    ('A-7', 'RIFAT ARA', 'NEET PG', DATE '2026-06-09', DATE '2026-07-08'),
    ('A-8', 'MEHREEN', 'NET', DATE '2026-05-28', DATE '2026-06-27'),
    ('A-9', 'KIFA', 'NEET-UG', DATE '2026-06-05', DATE '2026-07-04'),
    ('A-10', 'AYSHA NOOR', 'NEET-UG', DATE '2026-06-13', DATE '2026-07-12'),
    ('A-11', 'RAZIA MUNEEER', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('A-12', 'AIMAN ZUBAIR', 'PG', DATE '2026-06-07', DATE '2026-07-06'),
    ('A-13', 'SAHIL HABIB', 'UPSC', DATE '2026-06-08', DATE '2026-07-07'),
    ('B-2', 'MUNAZAR AHMAD', 'NEET PG', DATE '2026-06-05', DATE '2026-07-04'),
    ('B-3', 'SYED MAJID', 'JKSSB', DATE '2026-05-21', DATE '2026-07-20'),
    ('B-4', 'VILAYAT', 'UPSC', DATE '2026-01-19', DATE '2026-07-18'),
    ('B-7', 'WAJAHAT BASHIR', 'NEET - PG', DATE '2026-05-25', DATE '2026-06-26'),
    ('B-10', 'JAVAID ALI', 'NEET PG', DATE '2026-06-19', DATE '2026-07-18'),
    ('B-11', 'WASEEM AHMAD', 'CVIL SERVICE', DATE '2026-05-27', DATE '2026-06-26'),
    ('B-13', 'MOHD ADNAN', '10TH', DATE '2026-06-01', DATE '2026-06-30'),
    ('B-14', 'TAHIR AHMAD', 'CIVIL SER', DATE '2026-06-05', DATE '2026-07-04'),
    ('B-15', 'DANISH', 'JKSSB', DATE '2026-06-01', DATE '2026-06-30'),
    ('B-17', 'AAQIB RASHID', 'JKPSC', DATE '2026-06-20', DATE '2026-07-19'),
    ('B-18', 'AABID HUSSAIN', 'JKSSB', DATE '2026-06-18', DATE '2026-07-17'),
    ('B-19', 'AASIM TASADUQ', 'NEET - PG', DATE '2026-06-12', DATE '2026-07-11'),
    ('B-21', 'ZUBAIR', '', DATE '2026-06-22', DATE '2026-07-21'),
    ('C-2', 'SHEERAN JAVAID', 'NEET PG', DATE '2026-06-23', DATE '2026-07-22'),
    ('C-3', 'ANKUR', 'UPSC', DATE '2026-06-06', DATE '2026-07-05'),
    ('C-4', 'AMINA NAZIR', 'MD FINAL YEAR', DATE '2026-06-11', DATE '2026-07-10'),
    ('C-5', 'MUNAZAH HUSSAIN', 'CA', DATE '2026-06-03', DATE '2026-07-02'),
    ('C-6', 'HADIYA FAROOQ', 'CA', DATE '2026-06-20', DATE '2026-07-19'),
    ('C-7', 'AMAAN KHURSHID', 'JEE', DATE '2026-04-20', DATE '2026-07-22'),
    ('D-1', 'BILKEES TABASUM', 'NEET -UG', DATE '2026-05-15', DATE '2026-07-14'),
    ('D-4', 'GUL JABEEN', 'JKSSB', DATE '2026-05-04', DATE '2026-07-03'),
    ('D-10', 'ANISA SHOWKAT', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('D-12', 'USMAN', 'JEE', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-14', 'SYED AMASH', 'SEBI', DATE '2026-06-08', DATE '2026-07-07'),
    ('D-17', 'KHUSHNUMA', 'CIVIL SER.', DATE '2026-05-15', DATE '2026-07-14'),
    ('D-18', 'SUMAIRA', 'JKSSB', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-19', 'MEHRU NISA', 'NEET – UG', DATE '2026-06-04', DATE '2026-07-03'),
    ('D-20', 'DR. NYSAN', 'NEET PG', DATE '2026-05-27', DATE '2026-06-26'),
    ('D-21', 'MOHSINA RASOOL', 'NEET – UG', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-23', 'FATIMA ALI', 'NEET – UG', DATE '2026-05-11', DATE '2026-08-10'),
    ('D-25', 'MARWA RAMZAN', 'NEET – PG', DATE '2026-05-31', DATE '2026-06-30'),
    ('D-26', 'SEERAT JAAN', '', DATE '2026-06-04', DATE '2026-07-03'),
    ('D-27', 'RONAK MEHRAJ', 'NEET UG', DATE '2026-05-03', DATE '2026-07-02'),
    ('D-28', 'RUKAIYA AHAD', 'NEET - UG', DATE '2026-06-11', DATE '2026-07-10'),
    ('D-29', 'MEHBOOBA', 'NEET - UG', DATE '2026-06-14', DATE '2026-07-13'),
    ('D-30', 'TANIA', 'CA', DATE '2026-06-16', DATE '2026-07-15'),
    ('E-1', 'AKASH ASHRAF', 'FMGE', DATE '2026-06-05', DATE '2026-07-04'),
    ('E-2', 'AUQIB ALI', 'UPSC', DATE '2026-06-04', DATE '2026-07-03'),
    ('E-3', 'BABUR REYAN', 'SSC', DATE '2026-06-04', DATE '2026-07-03'),
    ('E-4', 'AASHIQ ALI', '', DATE '2026-06-12', DATE '2026-07-11'),
    ('E-6', 'MUSHTAQ AHMAD', 'UPSC', DATE '2026-06-12', DATE '2026-07-11'),
    ('E-7', 'MOHD ISAQ', 'NEET – UG', DATE '2026-05-05', DATE '2026-07-04'),
    ('E-8', 'AKSA', 'NEET – UG', DATE '2026-05-08', DATE '2026-07-07'),
    ('E-9', 'MANAN ASHRAF', 'JKPSC', DATE '2026-06-21', DATE '2026-07-05'),
    ('E-15', 'ALEENA BASHIR', 'FMGE', DATE '2026-05-11', DATE '2026-07-10'),
    ('E-16', 'HANAN MIR', 'FMGE', DATE '2026-05-24', DATE '2026-06-23'),
    ('F-5', 'FAISAL MANZOOR', 'UPSC', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-14', 'DR. SHAHZAIB', 'M.D', DATE '2026-06-26', DATE '2026-07-25'),
    ('F-15', 'TOYEEBA', 'CIVIL SER', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-18', 'AQIB JAVAID', 'FMGE', DATE '2026-06-06', DATE '2026-07-05'),
    ('F-19', 'ADIL BASHIR', 'JKSSB', DATE '2026-06-07', DATE '2026-07-06'),
    ('F-22', 'FAISAL HAMEED', 'NEET -PG', DATE '2026-05-28', DATE '2026-06-27'),
    ('F-24', 'SHAZIA PARVEEN', 'JKSSB', DATE '2026-05-08', DATE '2026-07-07'),
    ('F-28', 'JAMINA BANO', 'A.P', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-29', 'FIZA BANO', 'NEET-PG', DATE '2026-06-05', DATE '2026-07-04'),
    ('F-30', 'MURTAZA', '11TH', DATE '2026-04-24', DATE '2026-07-23'),
    ('F-32', 'IRFAN HASSAN', 'CA', DATE '2026-06-07', DATE '2026-07-06'),
    ('F-34', 'MOHD RAIHAN', '11TH', DATE '2026-06-01', DATE '2026-06-30'),
    ('F-35', 'SHAHID AHMAD DAR', '', DATE '2026-06-29', DATE '2026-08-12'),
    ('F-36', 'PARVAIZ AH DAR', 'LAW EXAM', DATE '2026-06-19', DATE '2026-07-18'),
    ('F-37', 'AABID ASHRAF', 'NEET – PG', DATE '2026-06-01', DATE '2026-08-30'),
    ('F-40', 'FAHEEM FAYAZ', 'NEET - PG', DATE '2026-06-12', DATE '2026-07-11'),
    ('F-41', 'ASIM LATEEF', 'CA', DATE '2026-06-22', DATE '2026-07-21')
),
b AS (
  SELECT id, "tenantId" AS tid FROM branches
  WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d'
),
norm AS (
  SELECT r.cabin, r.sname,
         regexp_replace(upper(btrim(r.sname)), '\s+', ' ', 'g') AS nkey
  FROM roster r
)
SELECT
  n.cabin, n.sname,
  (SELECT count(*) FROM students s, b
     WHERE s."tenantId" = b.tid
       AND regexp_replace(upper(btrim(s."fullName")), '\s+', ' ', 'g') = n.nkey) AS student_matches,
  (SELECT count(*) FROM seats se, b
     WHERE se."branchId" = b.id AND se.code = n.cabin)                           AS cabin_found
FROM norm n
ORDER BY 3, n.cabin;


-- ---------------------------------------------------------------------
-- MAIN TRANSACTION -- run after Step 0 looks clean.
-- ---------------------------------------------------------------------
BEGIN;

-- Resolve matched (seat, student) pairs once into a temp table.
CREATE TEMP TABLE _alloc ON COMMIT DROP AS
WITH roster(cabin, sname, course, dfrom, dto) AS ( VALUES
    ('A-1', 'MARIA HILAL', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('A-5', 'ZAMREEN', 'NEET – PG', DATE '2026-05-14', DATE '2026-07-13'),
    ('A-6', 'AZKA', 'UPSC', DATE '2026-06-05', DATE '2026-07-04'),
    ('A-7', 'RIFAT ARA', 'NEET PG', DATE '2026-06-09', DATE '2026-07-08'),
    ('A-8', 'MEHREEN', 'NET', DATE '2026-05-28', DATE '2026-06-27'),
    ('A-9', 'KIFA', 'NEET-UG', DATE '2026-06-05', DATE '2026-07-04'),
    ('A-10', 'AYSHA NOOR', 'NEET-UG', DATE '2026-06-13', DATE '2026-07-12'),
    ('A-11', 'RAZIA MUNEEER', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('A-12', 'AIMAN ZUBAIR', 'PG', DATE '2026-06-07', DATE '2026-07-06'),
    ('A-13', 'SAHIL HABIB', 'UPSC', DATE '2026-06-08', DATE '2026-07-07'),
    ('B-2', 'MUNAZAR AHMAD', 'NEET PG', DATE '2026-06-05', DATE '2026-07-04'),
    ('B-3', 'SYED MAJID', 'JKSSB', DATE '2026-05-21', DATE '2026-07-20'),
    ('B-4', 'VILAYAT', 'UPSC', DATE '2026-01-19', DATE '2026-07-18'),
    ('B-7', 'WAJAHAT BASHIR', 'NEET - PG', DATE '2026-05-25', DATE '2026-06-26'),
    ('B-10', 'JAVAID ALI', 'NEET PG', DATE '2026-06-19', DATE '2026-07-18'),
    ('B-11', 'WASEEM AHMAD', 'CVIL SERVICE', DATE '2026-05-27', DATE '2026-06-26'),
    ('B-13', 'MOHD ADNAN', '10TH', DATE '2026-06-01', DATE '2026-06-30'),
    ('B-14', 'TAHIR AHMAD', 'CIVIL SER', DATE '2026-06-05', DATE '2026-07-04'),
    ('B-15', 'DANISH', 'JKSSB', DATE '2026-06-01', DATE '2026-06-30'),
    ('B-17', 'AAQIB RASHID', 'JKPSC', DATE '2026-06-20', DATE '2026-07-19'),
    ('B-18', 'AABID HUSSAIN', 'JKSSB', DATE '2026-06-18', DATE '2026-07-17'),
    ('B-19', 'AASIM TASADUQ', 'NEET - PG', DATE '2026-06-12', DATE '2026-07-11'),
    ('B-21', 'ZUBAIR', '', DATE '2026-06-22', DATE '2026-07-21'),
    ('C-2', 'SHEERAN JAVAID', 'NEET PG', DATE '2026-06-23', DATE '2026-07-22'),
    ('C-3', 'ANKUR', 'UPSC', DATE '2026-06-06', DATE '2026-07-05'),
    ('C-4', 'AMINA NAZIR', 'MD FINAL YEAR', DATE '2026-06-11', DATE '2026-07-10'),
    ('C-5', 'MUNAZAH HUSSAIN', 'CA', DATE '2026-06-03', DATE '2026-07-02'),
    ('C-6', 'HADIYA FAROOQ', 'CA', DATE '2026-06-20', DATE '2026-07-19'),
    ('C-7', 'AMAAN KHURSHID', 'JEE', DATE '2026-04-20', DATE '2026-07-22'),
    ('D-1', 'BILKEES TABASUM', 'NEET -UG', DATE '2026-05-15', DATE '2026-07-14'),
    ('D-4', 'GUL JABEEN', 'JKSSB', DATE '2026-05-04', DATE '2026-07-03'),
    ('D-10', 'ANISA SHOWKAT', 'NEET UG', DATE '2026-06-15', DATE '2026-07-14'),
    ('D-12', 'USMAN', 'JEE', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-14', 'SYED AMASH', 'SEBI', DATE '2026-06-08', DATE '2026-07-07'),
    ('D-17', 'KHUSHNUMA', 'CIVIL SER.', DATE '2026-05-15', DATE '2026-07-14'),
    ('D-18', 'SUMAIRA', 'JKSSB', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-19', 'MEHRU NISA', 'NEET – UG', DATE '2026-06-04', DATE '2026-07-03'),
    ('D-20', 'DR. NYSAN', 'NEET PG', DATE '2026-05-27', DATE '2026-06-26'),
    ('D-21', 'MOHSINA RASOOL', 'NEET – UG', DATE '2026-06-01', DATE '2026-06-30'),
    ('D-23', 'FATIMA ALI', 'NEET – UG', DATE '2026-05-11', DATE '2026-08-10'),
    ('D-25', 'MARWA RAMZAN', 'NEET – PG', DATE '2026-05-31', DATE '2026-06-30'),
    ('D-26', 'SEERAT JAAN', '', DATE '2026-06-04', DATE '2026-07-03'),
    ('D-27', 'RONAK MEHRAJ', 'NEET UG', DATE '2026-05-03', DATE '2026-07-02'),
    ('D-28', 'RUKAIYA AHAD', 'NEET - UG', DATE '2026-06-11', DATE '2026-07-10'),
    ('D-29', 'MEHBOOBA', 'NEET - UG', DATE '2026-06-14', DATE '2026-07-13'),
    ('D-30', 'TANIA', 'CA', DATE '2026-06-16', DATE '2026-07-15'),
    ('E-1', 'AKASH ASHRAF', 'FMGE', DATE '2026-06-05', DATE '2026-07-04'),
    ('E-2', 'AUQIB ALI', 'UPSC', DATE '2026-06-04', DATE '2026-07-03'),
    ('E-3', 'BABUR REYAN', 'SSC', DATE '2026-06-04', DATE '2026-07-03'),
    ('E-4', 'AASHIQ ALI', '', DATE '2026-06-12', DATE '2026-07-11'),
    ('E-6', 'MUSHTAQ AHMAD', 'UPSC', DATE '2026-06-12', DATE '2026-07-11'),
    ('E-7', 'MOHD ISAQ', 'NEET – UG', DATE '2026-05-05', DATE '2026-07-04'),
    ('E-8', 'AKSA', 'NEET – UG', DATE '2026-05-08', DATE '2026-07-07'),
    ('E-9', 'MANAN ASHRAF', 'JKPSC', DATE '2026-06-21', DATE '2026-07-05'),
    ('E-15', 'ALEENA BASHIR', 'FMGE', DATE '2026-05-11', DATE '2026-07-10'),
    ('E-16', 'HANAN MIR', 'FMGE', DATE '2026-05-24', DATE '2026-06-23'),
    ('F-5', 'FAISAL MANZOOR', 'UPSC', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-14', 'DR. SHAHZAIB', 'M.D', DATE '2026-06-26', DATE '2026-07-25'),
    ('F-15', 'TOYEEBA', 'CIVIL SER', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-18', 'AQIB JAVAID', 'FMGE', DATE '2026-06-06', DATE '2026-07-05'),
    ('F-19', 'ADIL BASHIR', 'JKSSB', DATE '2026-06-07', DATE '2026-07-06'),
    ('F-22', 'FAISAL HAMEED', 'NEET -PG', DATE '2026-05-28', DATE '2026-06-27'),
    ('F-24', 'SHAZIA PARVEEN', 'JKSSB', DATE '2026-05-08', DATE '2026-07-07'),
    ('F-28', 'JAMINA BANO', 'A.P', DATE '2026-06-02', DATE '2026-07-01'),
    ('F-29', 'FIZA BANO', 'NEET-PG', DATE '2026-06-05', DATE '2026-07-04'),
    ('F-30', 'MURTAZA', '11TH', DATE '2026-04-24', DATE '2026-07-23'),
    ('F-32', 'IRFAN HASSAN', 'CA', DATE '2026-06-07', DATE '2026-07-06'),
    ('F-34', 'MOHD RAIHAN', '11TH', DATE '2026-06-01', DATE '2026-06-30'),
    ('F-35', 'SHAHID AHMAD DAR', '', DATE '2026-06-29', DATE '2026-08-12'),
    ('F-36', 'PARVAIZ AH DAR', 'LAW EXAM', DATE '2026-06-19', DATE '2026-07-18'),
    ('F-37', 'AABID ASHRAF', 'NEET – PG', DATE '2026-06-01', DATE '2026-08-30'),
    ('F-40', 'FAHEEM FAYAZ', 'NEET - PG', DATE '2026-06-12', DATE '2026-07-11'),
    ('F-41', 'ASIM LATEEF', 'CA', DATE '2026-06-22', DATE '2026-07-21')
),
b AS (
  SELECT id, "tenantId" AS tid FROM branches
  WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d'
)
SELECT DISTINCT ON (se.id)
       b.tid                         AS tenant_id,
       b.id                          AS branch_id,
       se.id                         AS seat_id,
       s.id                          AS student_id,
       r.dfrom                       AS start_date,
       r.dto                         AS end_date,
       btrim(r.course)               AS course
FROM roster r
CROSS JOIN b
JOIN seats se
  ON se."branchId" = b.id
 AND se.code = r.cabin
JOIN students s
  ON s."tenantId" = b.tid
 AND regexp_replace(upper(btrim(s."fullName")), '\s+', ' ', 'g')
   = regexp_replace(upper(btrim(r.sname)),       '\s+', ' ', 'g')
ORDER BY se.id, s."createdAt";   -- if a name matches >1 student, take the oldest

-- 1) Seat assignments (CONFIRMED, FULL_DAY, rate 1800)
INSERT INTO seat_assignments (
  id, "tenantId", "seatId", "studentId", shift,
  "startDate", "endDate", status, "monthlyRate", "nextDueDate",
  "assignedById", "createdAt"
)
SELECT
  gen_random_uuid(), a.tenant_id, a.seat_id, a.student_id, 'FULL_DAY'::"Shift",
  a.start_date, a.end_date, 'CONFIRMED'::"SeatAssignmentStatus", 1800, a.end_date,
  NULL, now()
FROM _alloc a;

-- 2) Full payment (PAID cash, 1800, purpose SEAT) -- zeroes the derived balance
--    notes = 'Migration | <course> | <from>..<to>'  (course omitted if blank)
INSERT INTO payments (
  id, "tenantId", "branchId", "studentId", amount, discount,
  currency, method, status, purpose, "paidAt", notes, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), a.tenant_id, a.branch_id, a.student_id, 1800, 0,
  'INR', 'CASH'::"PaymentMethod", 'PAID'::"PaymentStatus", 'SEAT'::"PaymentPurpose",
  a.start_date::timestamp,
  'Migration'
    || CASE WHEN COALESCE(a.course,'') <> '' THEN ' | ' || a.course ELSE '' END
    || ' | ' || to_char(a.start_date,'YYYY-MM-DD') || '..' || to_char(a.end_date,'YYYY-MM-DD'),
  now(), now()
FROM _alloc a;

-- 3) Recompute derived balance for this tenant's students (mirror of 030)
UPDATE students s
SET "outstandingBalance" = ROUND(sub.bal, 2)
FROM (
    SELECT st.id,
           COALESCE(seat.amt,0) + COALESCE(pg.amt,0) + COALESCE(tif.amt,0)
           - COALESCE(pay.paid,0) - COALESCE(pay.disc,0) AS bal
    FROM students st
    LEFT JOIN (SELECT "studentId", SUM("monthlyRate") amt FROM seat_assignments
               WHERE status IN ('TEMPORARY','CONFIRMED') GROUP BY 1) seat ON seat."studentId"=st.id
    LEFT JOIN (SELECT "studentId", SUM("monthlyRate") amt FROM pg_room_assignments
               WHERE status='ACTIVE' GROUP BY 1) pg ON pg."studentId"=st.id
    LEFT JOIN (SELECT "studentId", SUM("monthlyRate") amt FROM tiffin_subscriptions
               WHERE status='ACTIVE' GROUP BY 1) tif ON tif."studentId"=st.id
    LEFT JOIN (SELECT "studentId", SUM(amount) paid, SUM(COALESCE(discount,0)) disc
               FROM payments WHERE status='PAID' AND "deletedAt" IS NULL GROUP BY 1) pay ON pay."studentId"=st.id
    WHERE st."tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d'
) sub
WHERE s.id = sub.id AND s."tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d';

-- 4) Sanity check (review before COMMIT)
SELECT
  (SELECT count(*) FROM _alloc)                                                   AS pairs_matched,
  (SELECT count(*) FROM seat_assignments sa JOIN _alloc a ON a.seat_id=sa."seatId") AS assignments_now;

COMMIT;
