-- 030_derive_student_balance.sql
-- The student account balance is now a DERIVED value (materialised in
-- students.outstandingBalance and maintained by BalanceService.recompute after
-- every money/allocation event):
--
--   outstandingBalance = expected − paid − discount
--     expected = SUM(monthlyRate) of ACTIVE cabin/seat + PG + tiffin
--     paid/discount = PAID, non-deleted payments
--
-- This one-time backfill brings every existing student in line with that
-- definition so historical rows match the new model. Pure UPDATE — idempotent.

UPDATE students s
SET "outstandingBalance" = ROUND(sub.bal, 2)
FROM (
    SELECT st.id,
           COALESCE(seat.amt, 0) + COALESCE(pg.amt, 0) + COALESCE(tif.amt, 0)
           - COALESCE(pay.paid, 0) - COALESCE(pay.disc, 0) AS bal
    FROM students st
    LEFT JOIN (
        SELECT "studentId", SUM("monthlyRate") AS amt
        FROM seat_assignments WHERE status IN ('TEMPORARY','CONFIRMED') GROUP BY 1
    ) seat ON seat."studentId" = st.id
    LEFT JOIN (
        SELECT "studentId", SUM("monthlyRate") AS amt
        FROM pg_room_assignments WHERE status = 'ACTIVE' GROUP BY 1
    ) pg ON pg."studentId" = st.id
    LEFT JOIN (
        SELECT "studentId", SUM("monthlyRate") AS amt
        FROM tiffin_subscriptions WHERE status = 'ACTIVE' GROUP BY 1
    ) tif ON tif."studentId" = st.id
    LEFT JOIN (
        SELECT "studentId", SUM(amount) AS paid, SUM(COALESCE(discount, 0)) AS disc
        FROM payments WHERE status = 'PAID' AND "deletedAt" IS NULL GROUP BY 1
    ) pay ON pay."studentId" = st.id
) sub
WHERE s.id = sub.id;
