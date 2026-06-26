-- 039_tiffin_subscriptions.sql
-- Source: prisma/TIFFIN EXCEL.xlsx  (NAME, FROM, TILL, CONTACT, addresses, remarks, agent)
-- Adds tiffin subscriptions for the 41 listed people, tenant:
--     fc12398f-6db3-4bfd-9779-544d1678a91d
--
-- Behaviour:
--   * Match each person to an existing student by NAME, else by PHONE
--     (case/space-insensitive name; real phones only -- placeholders that
--     start with '0' are ignored for matching).
--       - matched  -> reuse that student (no duplicate created).
--       - no match -> CREATE the student (code continues STU-#### , phone =
--                     CONTACT, joinedAt = FROM, status ACTIVE).
--   * One ACTIVE tiffin_subscription per person: monthlyRate 4500,
--     paidAmount 4500, balance 0, startDate = FROM, endDate/nextDueDate = TILL,
--     mealType VEG + mealPlan BOTH (defaults). Delivery left UNASSIGNED;
--     addresses / remarks / agent captured in subscription notes.
--   * A PAID cash payment of 4500 (purpose TIFFIN) per new subscription.
--   * Skips anyone who already has an ACTIVE tiffin subscription (idempotent).
--   * Recomputes students.outstandingBalance for the tenant.
--
-- Data notes:
--   * Duplicate sheet rows (FEHRAB x3 = pause/due annotations) collapsed to 1.
--   * students has UNIQUE(tenantId, phone). FAIZAN & SUHAIB share MUSHARAF's
--     number 6006600536, so they were given placeholder phones 0000000001 /
--     0000000002 (real number preserved in their notes). FAIZAN/SUHAIB also
--     have a reversed FROM/TILL in the sheet -- left as-is.
-- =====================================================================


-- ---------------------------------------------------------------------
-- STEP 0  (READ-ONLY DRY RUN) -- run on its own first.
--   action: create | reuse(name) | reuse(phone)
-- ---------------------------------------------------------------------
WITH roster(sname, dfrom, dto, phone, notes) AS ( VALUES
    ('HASEENA', DATE '2026-06-03', DATE '2026-07-02', '9086417536', 'Migration | BOTH MEALS | Addr: DARUL ALOOM BABA DAWOOD | Agent: RIZWAN'),
    ('KHUSHBOO', DATE '2026-05-16', DATE '2026-07-15', '9669834684', 'Migration | VEG MENU BOTH MEALS | Addr: NIT LANE CHECKBAGH | Agent: RIZWAN'),
    ('FEHRAB', DATE '2026-05-30', DATE '2026-06-29', '7006858117', 'Migration | BOTH MEALS / 100rs extra packing | Addr: MOON LIGHT DARGAH | Agent: RIZWAN'),
    ('DR. SHIBRA', DATE '2026-06-03', DATE '2026-07-02', '8210311198', 'Migration | BOTH MEALS | Addr: MATERNITY HOSPITAL SOURA | Agent: RIZWAN'),
    ('SHAFIQ AH.', DATE '2026-06-14', DATE '2026-07-13', '9999314701', 'Migration | BOTH MEALS | Addr: MALIK SAHIB ASTAN | Agent: RIZWAN'),
    ('SHAHKAR', DATE '2026-06-02', DATE '2026-07-01', '6005675877', 'Migration | DINNER WITH LUNCH MENU | Dinner: SADERBAL | Agent: RIZWAN'),
    ('DR YAWAR', DATE '2026-06-13', DATE '2026-07-12', '7051715234', 'Migration | LUNCH ONLY | Lunch: SAFA MARWAH HOSPITAL 90 FEET | Agent: RIZWAN'),
    ('MUSHARAF', DATE '2026-06-01', DATE '2026-06-30', '6006600536', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN'),
    ('ASIF', DATE '2026-05-04', DATE '2026-07-03', '9070101010', 'Migration | BOTH MEALS | Addr: PHQ PEERBAGH | Agent: IRFAN'),
    ('MUDESERA', DATE '2026-06-04', DATE '2026-07-03', '6006149208', 'Migration | DINNER WITH LUNCH MENU | Dinner: JVC | Agent: IRFAN'),
    ('ADV. VIKAS', DATE '2026-06-15', DATE '2026-07-17', '7889982310', 'Migration | LUNCH ONLY 2 ROTIS AND HAF RICE | Lunch: COURT BATAMALOO | Agent: IRFAN'),
    ('DR RAMEEZ', DATE '2026-05-31', DATE '2026-06-30', '8877372501', 'Migration | BOTH MEALS | Addr: JVC BEMINA | Agent: IRFAN'),
    ('DR FAZIL', DATE '2026-06-15', DATE '2026-07-14', '6006311585', 'Migration | DINNER ONLY VEG MENU 4 ROTISNO RICE | Dinner: PARRYPORA | Agent: IRFAN'),
    ('SHOAIB', DATE '2026-05-10', DATE '2026-07-09', '9682603100', 'Migration | LUNCH & DINNER | Addr: BEMINA | Agent: IRFAN'),
    ('REHAN MEHNAS', DATE '2026-06-22', DATE '2026-07-21', '8899190607', 'Migration | BOTH MEALS | Addr: IOT ZAKURA | Agent: RIZWAN'),
    ('GH MOHAMMAD DAR', DATE '2026-06-01', DATE '2026-06-30', '6005776098', 'Migration | BOTH MEALS ONLY VEG | Addr: BARBARSHAH | Agent: RIZWAN'),
    ('ADV. ANGAT', DATE '2026-06-02', DATE '2026-07-01', '7006290442', 'Migration | VEG MENU LUNCH ONLY | Lunch: BATMALOO COURT | Agent: IRFAN'),
    ('BARKAT NAZIR', DATE '2026-06-02', DATE '2026-07-01', '6005493725', 'Migration | BOTH MEALS | Addr: SADERBAL AL NOOR LIBRARY | Agent: RIZWAN'),
    ('TAIBA ALAM', DATE '2026-06-02', DATE '2026-07-01', '7889700654', 'Migration | LUNCH ONLY | Lunch: SADERBAL | Agent: RIZWAN'),
    ('ADV ISHAY', DATE '2026-06-03', DATE '2026-07-04', '8492801641', 'Migration | LUNCH ONLY | Lunch: COURT BATAMALOO | Agent: IRFAN'),
    ('ZULKEARNAIN', DATE '2026-06-03', DATE '2026-07-04', '9149401719', 'Migration | PURE VEG SALAN ONLY | Addr: KHAYAM CHOWK | Agent: RIZWAN'),
    ('AQIB RASHID BHAT', DATE '2026-06-04', DATE '2026-07-03', '7889934085', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('NADEEM UL HAQ', DATE '2026-06-04', DATE '2026-07-03', '7889381451', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('FIDA HAMZA', DATE '2026-06-04', DATE '2026-07-03', '8491847039', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('ARSHAD', DATE '2026-06-04', DATE '2026-07-03', '7006790783', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('TAWFEEQ SHAFI', DATE '2026-06-04', DATE '2026-07-03', '9541040447', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('KAUSHIK', DATE '2026-06-02', DATE '2026-07-01', '9541409961', 'Migration | BOTH MEALS | Addr: TANKIPORA | Agent: IRFAN'),
    ('DR IMTIYAZ', DATE '2026-06-20', DATE '2026-07-19', '6006899707', 'Migration | LUNCH ONLY | Lunch: LAL BAZAR | Agent: RIZWAN'),
    ('DR. ZAVVAR KAZIM', DATE '2026-06-06', DATE '2026-07-05', '9717788501', 'Migration | BOTH MEALS /2 ROTI + IN DINNER | Lunch: BEMINA | Dinner: RAJBAGH | Agent: IRFAN'),
    ('DANISH RAZA', DATE '2026-06-07', DATE '2026-07-06', '8958972521', 'Migration | BOTH MEALS  HALF RICE + 2 ROTIS | Addr: LASJAN BYPASS | Agent: IRFAN'),
    ('SHAHID ALI', DATE '2026-06-07', DATE '2026-07-06', '9186233633', 'Migration | BOTH MEALS  HALF RICE + 2 ROTIS | Addr: CHANAPORA | Agent: IRFAN'),
    ('MUQADAS ASHRAF', DATE '2026-06-11', DATE '2026-07-01', '7006273083', 'Migration | BOTH MEALS | Addr: TENGPOORA | Agent: IRFAN'),
    ('DR. LUBNA', DATE '2026-06-13', DATE '2026-07-12', '6289261545', 'Migration | BOTH MEALS  FULL RICE + 3 ROTIS | Addr: BAGAHT NIRMAN COMPLEX | Agent: IRFAN'),
    ('DUA ARIF', DATE '2026-06-12', DATE '2026-06-26', '8899501291', 'Migration | DINNER WITH LUNCH MENU | Dinner: JVC GIRLS HOSTEL | Agent: IRFAN'),
    ('DARSHIL KORAT', DATE '2026-06-13', DATE '2026-07-12', '7874406785', 'Migration | BOTH MEALS | Addr: SOURA | Agent: RIZWAN'),
    ('ZAINAB', DATE '2026-06-16', DATE '2026-07-17', '7065588025', 'Migration | BOTH MEALS / NO RAJMA DAAL | Addr: JAWHAR NAGAR'),
    ('FAIZAN', DATE '2026-06-18', DATE '2026-06-17', '0000000001', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN | NOTE real phone 6006600536 (shared - placeholder 0000000001 set for unique constraint)'),
    ('SUHAIB', DATE '2026-06-18', DATE '2026-06-17', '0000000002', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN | NOTE real phone 6006600536 (shared - placeholder 0000000002 set for unique constraint)'),
    ('JAHANGIR ASIF', DATE '2026-06-20', DATE '2026-07-19', '8697733030', 'Migration | BOTH MEALS | Addr: BEMINA | Agent: IRFAN'),
    ('DR SHAMAAILA', DATE '2026-06-22', DATE '2026-07-14', '9548306238', 'Migration | LUNCH ONLY EXCEPT SUNDAYS | Lunch: LD HOSPITAL | Agent: IRFAN'),
    ('ADV MUSHTAQ', DATE '2026-04-07', DATE '2026-05-06', '9596486741', 'Migration | LUNCH MEAL IN DINNER SATURDAY AND SUNDAY OFF | Agent: RIZWAN')
),
b AS (SELECT id, "tenantId" AS tid FROM branches WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d')
SELECT
  r.sname, r.phone,
  (SELECT count(*) FROM students s, b WHERE s."tenantId"=b.tid
     AND regexp_replace(upper(btrim(s."fullName")), '\s+', ' ', 'g')
       = regexp_replace(upper(btrim(r.sname)), '\s+', ' ', 'g'))               AS name_matches,
  (SELECT count(*) FROM students s, b WHERE s."tenantId"=b.tid
     AND r.phone !~ '^0' AND s.phone = r.phone)                                AS phone_matches,
  CASE
    WHEN (SELECT count(*) FROM students s, b WHERE s."tenantId"=b.tid
            AND regexp_replace(upper(btrim(s."fullName")),'\s+',' ','g')
              = regexp_replace(upper(btrim(r.sname)),'\s+',' ','g')) > 0 THEN 'reuse(name)'
    WHEN (SELECT count(*) FROM students s, b WHERE s."tenantId"=b.tid
            AND r.phone !~ '^0' AND s.phone = r.phone) > 0 THEN 'reuse(phone)'
    ELSE 'create' END AS action
FROM roster r
ORDER BY action, r.sname;


-- ---------------------------------------------------------------------
-- MAIN TRANSACTION -- run after Step 0 looks sane.
-- ---------------------------------------------------------------------
BEGIN;

CREATE TEMP TABLE _tif ON COMMIT DROP AS
WITH roster(sname, dfrom, dto, phone, notes) AS ( VALUES
    ('HASEENA', DATE '2026-06-03', DATE '2026-07-02', '9086417536', 'Migration | BOTH MEALS | Addr: DARUL ALOOM BABA DAWOOD | Agent: RIZWAN'),
    ('KHUSHBOO', DATE '2026-05-16', DATE '2026-07-15', '9669834684', 'Migration | VEG MENU BOTH MEALS | Addr: NIT LANE CHECKBAGH | Agent: RIZWAN'),
    ('FEHRAB', DATE '2026-05-30', DATE '2026-06-29', '7006858117', 'Migration | BOTH MEALS / 100rs extra packing | Addr: MOON LIGHT DARGAH | Agent: RIZWAN'),
    ('DR. SHIBRA', DATE '2026-06-03', DATE '2026-07-02', '8210311198', 'Migration | BOTH MEALS | Addr: MATERNITY HOSPITAL SOURA | Agent: RIZWAN'),
    ('SHAFIQ AH.', DATE '2026-06-14', DATE '2026-07-13', '9999314701', 'Migration | BOTH MEALS | Addr: MALIK SAHIB ASTAN | Agent: RIZWAN'),
    ('SHAHKAR', DATE '2026-06-02', DATE '2026-07-01', '6005675877', 'Migration | DINNER WITH LUNCH MENU | Dinner: SADERBAL | Agent: RIZWAN'),
    ('DR YAWAR', DATE '2026-06-13', DATE '2026-07-12', '7051715234', 'Migration | LUNCH ONLY | Lunch: SAFA MARWAH HOSPITAL 90 FEET | Agent: RIZWAN'),
    ('MUSHARAF', DATE '2026-06-01', DATE '2026-06-30', '6006600536', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN'),
    ('ASIF', DATE '2026-05-04', DATE '2026-07-03', '9070101010', 'Migration | BOTH MEALS | Addr: PHQ PEERBAGH | Agent: IRFAN'),
    ('MUDESERA', DATE '2026-06-04', DATE '2026-07-03', '6006149208', 'Migration | DINNER WITH LUNCH MENU | Dinner: JVC | Agent: IRFAN'),
    ('ADV. VIKAS', DATE '2026-06-15', DATE '2026-07-17', '7889982310', 'Migration | LUNCH ONLY 2 ROTIS AND HAF RICE | Lunch: COURT BATAMALOO | Agent: IRFAN'),
    ('DR RAMEEZ', DATE '2026-05-31', DATE '2026-06-30', '8877372501', 'Migration | BOTH MEALS | Addr: JVC BEMINA | Agent: IRFAN'),
    ('DR FAZIL', DATE '2026-06-15', DATE '2026-07-14', '6006311585', 'Migration | DINNER ONLY VEG MENU 4 ROTISNO RICE | Dinner: PARRYPORA | Agent: IRFAN'),
    ('SHOAIB', DATE '2026-05-10', DATE '2026-07-09', '9682603100', 'Migration | LUNCH & DINNER | Addr: BEMINA | Agent: IRFAN'),
    ('REHAN MEHNAS', DATE '2026-06-22', DATE '2026-07-21', '8899190607', 'Migration | BOTH MEALS | Addr: IOT ZAKURA | Agent: RIZWAN'),
    ('GH MOHAMMAD DAR', DATE '2026-06-01', DATE '2026-06-30', '6005776098', 'Migration | BOTH MEALS ONLY VEG | Addr: BARBARSHAH | Agent: RIZWAN'),
    ('ADV. ANGAT', DATE '2026-06-02', DATE '2026-07-01', '7006290442', 'Migration | VEG MENU LUNCH ONLY | Lunch: BATMALOO COURT | Agent: IRFAN'),
    ('BARKAT NAZIR', DATE '2026-06-02', DATE '2026-07-01', '6005493725', 'Migration | BOTH MEALS | Addr: SADERBAL AL NOOR LIBRARY | Agent: RIZWAN'),
    ('TAIBA ALAM', DATE '2026-06-02', DATE '2026-07-01', '7889700654', 'Migration | LUNCH ONLY | Lunch: SADERBAL | Agent: RIZWAN'),
    ('ADV ISHAY', DATE '2026-06-03', DATE '2026-07-04', '8492801641', 'Migration | LUNCH ONLY | Lunch: COURT BATAMALOO | Agent: IRFAN'),
    ('ZULKEARNAIN', DATE '2026-06-03', DATE '2026-07-04', '9149401719', 'Migration | PURE VEG SALAN ONLY | Addr: KHAYAM CHOWK | Agent: RIZWAN'),
    ('AQIB RASHID BHAT', DATE '2026-06-04', DATE '2026-07-03', '7889934085', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('NADEEM UL HAQ', DATE '2026-06-04', DATE '2026-07-03', '7889381451', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('FIDA HAMZA', DATE '2026-06-04', DATE '2026-07-03', '8491847039', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('ARSHAD', DATE '2026-06-04', DATE '2026-07-03', '7006790783', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('TAWFEEQ SHAFI', DATE '2026-06-04', DATE '2026-07-03', '9541040447', 'Migration | BOTH MEALS | Addr: SHUTRASHAHI | Agent: IRFAN'),
    ('KAUSHIK', DATE '2026-06-02', DATE '2026-07-01', '9541409961', 'Migration | BOTH MEALS | Addr: TANKIPORA | Agent: IRFAN'),
    ('DR IMTIYAZ', DATE '2026-06-20', DATE '2026-07-19', '6006899707', 'Migration | LUNCH ONLY | Lunch: LAL BAZAR | Agent: RIZWAN'),
    ('DR. ZAVVAR KAZIM', DATE '2026-06-06', DATE '2026-07-05', '9717788501', 'Migration | BOTH MEALS /2 ROTI + IN DINNER | Lunch: BEMINA | Dinner: RAJBAGH | Agent: IRFAN'),
    ('DANISH RAZA', DATE '2026-06-07', DATE '2026-07-06', '8958972521', 'Migration | BOTH MEALS  HALF RICE + 2 ROTIS | Addr: LASJAN BYPASS | Agent: IRFAN'),
    ('SHAHID ALI', DATE '2026-06-07', DATE '2026-07-06', '9186233633', 'Migration | BOTH MEALS  HALF RICE + 2 ROTIS | Addr: CHANAPORA | Agent: IRFAN'),
    ('MUQADAS ASHRAF', DATE '2026-06-11', DATE '2026-07-01', '7006273083', 'Migration | BOTH MEALS | Addr: TENGPOORA | Agent: IRFAN'),
    ('DR. LUBNA', DATE '2026-06-13', DATE '2026-07-12', '6289261545', 'Migration | BOTH MEALS  FULL RICE + 3 ROTIS | Addr: BAGAHT NIRMAN COMPLEX | Agent: IRFAN'),
    ('DUA ARIF', DATE '2026-06-12', DATE '2026-06-26', '8899501291', 'Migration | DINNER WITH LUNCH MENU | Dinner: JVC GIRLS HOSTEL | Agent: IRFAN'),
    ('DARSHIL KORAT', DATE '2026-06-13', DATE '2026-07-12', '7874406785', 'Migration | BOTH MEALS | Addr: SOURA | Agent: RIZWAN'),
    ('ZAINAB', DATE '2026-06-16', DATE '2026-07-17', '7065588025', 'Migration | BOTH MEALS / NO RAJMA DAAL | Addr: JAWHAR NAGAR'),
    ('FAIZAN', DATE '2026-06-18', DATE '2026-06-17', '0000000001', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN | NOTE real phone 6006600536 (shared - placeholder 0000000001 set for unique constraint)'),
    ('SUHAIB', DATE '2026-06-18', DATE '2026-06-17', '0000000002', 'Migration | BOTH MEALS | Addr: CHATTABAL | Agent: RIZWAN | NOTE real phone 6006600536 (shared - placeholder 0000000002 set for unique constraint)'),
    ('JAHANGIR ASIF', DATE '2026-06-20', DATE '2026-07-19', '8697733030', 'Migration | BOTH MEALS | Addr: BEMINA | Agent: IRFAN'),
    ('DR SHAMAAILA', DATE '2026-06-22', DATE '2026-07-14', '9548306238', 'Migration | LUNCH ONLY EXCEPT SUNDAYS | Lunch: LD HOSPITAL | Agent: IRFAN'),
    ('ADV MUSHTAQ', DATE '2026-04-07', DATE '2026-05-06', '9596486741', 'Migration | LUNCH MEAL IN DINNER SATURDAY AND SUNDAY OFF | Agent: RIZWAN')
),
b AS (SELECT id, "tenantId" AS tid FROM branches WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d')
SELECT r.sname, r.dfrom, r.dto, r.phone, r.notes,
       b.id AS branch_id, b.tid AS tenant_id,
       regexp_replace(upper(btrim(r.sname)), '\s+', ' ', 'g') AS nkey
FROM roster r CROSS JOIN b;

-- 1) Create students with no NAME and no (real) PHONE match yet
WITH base AS (
  SELECT COALESCE(MAX((substring(code from '^STU-(\d+)$'))::int), 0) AS mx
  FROM students WHERE "tenantId" = 'fc12398f-6db3-4bfd-9779-544d1678a91d' AND code ~ '^STU-\d+$'
),
missing AS (
  SELECT t.*, row_number() OVER (ORDER BY t.sname) AS rn
  FROM _tif t
  WHERE NOT EXISTS (
          SELECT 1 FROM students s WHERE s."tenantId" = t.tenant_id
            AND regexp_replace(upper(btrim(s."fullName")), '\s+', ' ', 'g') = t.nkey)
    AND NOT EXISTS (
          SELECT 1 FROM students s WHERE s."tenantId" = t.tenant_id
            AND t.phone !~ '^0' AND s.phone = t.phone)
)
INSERT INTO students (
  id, "tenantId", "branchId", code, "fullName", phone,
  status, "joinedAt", "qrCode", "outstandingBalance", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), m.tenant_id, m.branch_id,
  'STU-' || lpad((base.mx + m.rn)::text, 4, '0'),
  m.sname, m.phone,
  'ACTIVE'::"StudentStatus", m.dfrom::timestamp, gen_random_uuid()::text, 0, now(), now()
FROM missing m CROSS JOIN base;

-- 2) Resolve each person to a student (name first, else real phone), then
--    create one ACTIVE subscription (+ chained payment) per student.
WITH resolved AS (
  SELECT t.tenant_id, t.branch_id, t.dfrom, t.dto, t.notes,
         COALESCE(
           (SELECT s.id FROM students s WHERE s."tenantId" = t.tenant_id
              AND regexp_replace(upper(btrim(s."fullName")), '\s+', ' ', 'g') = t.nkey
            ORDER BY s."createdAt" LIMIT 1),
           (SELECT s.id FROM students s WHERE s."tenantId" = t.tenant_id
              AND t.phone !~ '^0' AND s.phone = t.phone
            ORDER BY s."createdAt" LIMIT 1)
         ) AS student_id
  FROM _tif t
),
pick AS (
  SELECT DISTINCT ON (r.student_id)
         r.tenant_id, r.branch_id, r.student_id, r.dfrom, r.dto, r.notes
  FROM resolved r
  WHERE r.student_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM tiffin_subscriptions ts
                     WHERE ts."studentId" = r.student_id AND ts.status = 'ACTIVE')
  ORDER BY r.student_id, r.dfrom
),
ins AS (
  INSERT INTO tiffin_subscriptions (
    id, "tenantId", "branchId", "studentId", "mealType", "mealPlan",
    "monthlyRate", "paidAmount", balance, "startDate", "endDate", "nextDueDate",
    status, "deliveryAssignee", "deliveryPhone", "pausedDays", notes,
    "createdAt", "updatedAt"
  )
  SELECT
    gen_random_uuid(), p.tenant_id, p.branch_id, p.student_id, 'VEG'::"TiffinMealType",
    'BOTH'::"TiffinMealPlan", 4500, 4500, 0, p.dfrom, p.dto, p.dto,
    'ACTIVE'::"TiffinStatus", NULL, NULL, 0, p.notes, now(), now()
  FROM pick p
  RETURNING "tenantId", "branchId", "studentId", "startDate"
)
INSERT INTO payments (
  id, "tenantId", "branchId", "studentId", amount, discount,
  currency, method, status, purpose, "paidAt", notes, "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid(), i."tenantId", i."branchId", i."studentId", 4500, 0,
  'INR', 'CASH'::"PaymentMethod", 'PAID'::"PaymentStatus", 'TIFFIN'::"PaymentPurpose",
  i."startDate", 'Migration tiffin', now(), now()
FROM ins i;

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
  (SELECT count(*) FROM _tif)                                                           AS roster_people,
  (SELECT count(*) FROM tiffin_subscriptions WHERE "tenantId"='fc12398f-6db3-4bfd-9779-544d1678a91d' AND status='ACTIVE') AS active_tiffins_now;

COMMIT;
