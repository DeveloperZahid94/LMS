-- 029_reports_money_reconcile.sql
-- Reconcile the reporting functions with the full money model so report totals
-- stop mismatching. Three classes of fix, all idempotent (CREATE OR REPLACE):
--
--   1. EXPECTED now spans every billable accommodation — seat (cabin) + PG bed +
--      tiffin — not just seats. Previously `expected` summed seat rates only while
--      `paid` summed ALL payments (cabin+PG+tiffin), so any PG/tiffin payer showed
--      a phantom advance / wrong status. Now both sides are holistic.
--
--   2. DISCOUNTS count toward clearing dues. Balance = expected − paid − discount,
--      and the PAID threshold uses (paid + discount). The cash `paid_amount` column
--      is left as cash-only so collected/income figures stay honest.
--
--   3. SOFT-DELETED payments (deletedAt IS NOT NULL) are excluded everywhere — they
--      were still inflating timeseries income, method breakdown and student paid.
--
--   4. AGING spans seat + PG + tiffin allocations (was seat-only).
--
-- Signatures are unchanged, so the API/TS layer needs no changes.

-- ============================================================
-- 1. PAYMENTS TIMESERIES — exclude soft-deleted
-- ============================================================
CREATE OR REPLACE FUNCTION fn_payments_timeseries(
    p_tenant_id TEXT,
    p_branch_id TEXT,
    p_date_from DATE,
    p_date_to   DATE,
    p_bucket    TEXT
)
RETURNS TABLE(
    bucket_start    TIMESTAMP,
    payment_count   INT,
    total_amount    NUMERIC,
    paid_amount     NUMERIC,
    pending_amount  NUMERIC,
    refunded_amount NUMERIC,
    failed_amount   NUMERIC
)
LANGUAGE plpgsql AS $$
DECLARE
    v_bucket TEXT;
BEGIN
    v_bucket := CASE
        WHEN lower(coalesce(p_bucket, '')) IN ('day','week','month','year')
            THEN lower(p_bucket)
        ELSE 'day'
    END;

    RETURN QUERY EXECUTE format($sql$
        SELECT date_trunc(%L, COALESCE(p."paidAt", p."createdAt"))::timestamp AS bucket_start,
               COUNT(*)::int                                                  AS payment_count,
               COALESCE(SUM(p.amount), 0)::numeric                            AS total_amount,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PAID'),     0)::numeric AS paid_amount,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'PENDING'),  0)::numeric AS pending_amount,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'REFUNDED'), 0)::numeric AS refunded_amount,
               COALESCE(SUM(p.amount) FILTER (WHERE p.status = 'FAILED'),   0)::numeric AS failed_amount
        FROM payments p
        WHERE p."tenantId" = $1
          AND p."deletedAt" IS NULL
          AND ($2 IS NULL OR p."branchId" = $2)
          AND COALESCE(p."paidAt", p."createdAt") >= $3::timestamp
          AND COALESCE(p."paidAt", p."createdAt") <  ($4::date + INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1
    $sql$, v_bucket)
    USING p_tenant_id, p_branch_id, p_date_from, p_date_to;
END $$;


-- ============================================================
-- 2. STUDENT PAYMENT SUMMARY — holistic expected, discounts, soft-delete
-- ============================================================
CREATE OR REPLACE FUNCTION fn_student_payment_summary(
    p_tenant_id TEXT,
    p_branch_id TEXT,
    p_date_from DATE,
    p_date_to   DATE
)
RETURNS TABLE(
    student_id      TEXT,
    code            TEXT,
    full_name       TEXT,
    phone           TEXT,
    email           TEXT,
    branch_id       TEXT,
    branch_name     TEXT,
    expected_amount NUMERIC,
    paid_amount     NUMERIC,
    pending_amount  NUMERIC,
    balance         NUMERIC,
    payment_count   INT,
    last_payment_at TIMESTAMP,
    status          TEXT
)
LANGUAGE sql AS $$
    WITH expected AS (
        SELECT "studentId", SUM(rate) AS expected_amt
        FROM (
            SELECT sa."studentId", COALESCE(sa."monthlyRate", 0) AS rate
              FROM seat_assignments sa
             WHERE sa."tenantId" = p_tenant_id
               AND sa.status IN ('TEMPORARY','CONFIRMED')
            UNION ALL
            SELECT pra."studentId", COALESCE(pra."monthlyRate", 0)
              FROM pg_room_assignments pra
             WHERE pra."tenantId" = p_tenant_id
               AND pra.status = 'ACTIVE'
            UNION ALL
            SELECT ts."studentId", COALESCE(ts."monthlyRate", 0)
              FROM tiffin_subscriptions ts
             WHERE ts."tenantId" = p_tenant_id
               AND ts.status = 'ACTIVE'
        ) billable
        GROUP BY "studentId"
    ),
    paid AS (
        SELECT p."studentId",
               COUNT(*) FILTER (WHERE p.status = 'PAID')::int   AS pay_count,
               SUM(p.amount) FILTER (WHERE p.status = 'PAID')              AS paid_amt,
               SUM(COALESCE(p.discount, 0)) FILTER (WHERE p.status = 'PAID') AS disc_amt,
               SUM(p.amount) FILTER (WHERE p.status = 'PENDING')          AS pending_amt,
               MAX(COALESCE(p."paidAt", p."createdAt"))
                   FILTER (WHERE p.status = 'PAID')                       AS last_paid
        FROM payments p
        WHERE p."tenantId" = p_tenant_id
          AND p."deletedAt" IS NULL
          AND (p_branch_id IS NULL OR p."branchId" = p_branch_id)
          AND COALESCE(p."paidAt", p."createdAt") >= p_date_from::timestamp
          AND COALESCE(p."paidAt", p."createdAt") <  (p_date_to::date + INTERVAL '1 day')
        GROUP BY p."studentId"
    )
    SELECT s.id::text                             AS student_id,
           s.code::text                           AS code,
           s."fullName"::text                     AS full_name,
           s.phone::text                          AS phone,
           s.email::text                          AS email,
           s."branchId"::text                     AS branch_id,
           b.name::text                           AS branch_name,
           COALESCE(e.expected_amt, 0)::numeric   AS expected_amount,
           COALESCE(pd.paid_amt, 0)::numeric      AS paid_amount,
           COALESCE(pd.pending_amt, 0)::numeric   AS pending_amount,
           (COALESCE(e.expected_amt, 0) - COALESCE(pd.paid_amt, 0) - COALESCE(pd.disc_amt, 0))::numeric AS balance,
           COALESCE(pd.pay_count, 0)              AS payment_count,
           pd.last_paid::timestamp                AS last_payment_at,
           CASE
               WHEN COALESCE(e.expected_amt, 0) > 0
                    AND (COALESCE(pd.paid_amt, 0) + COALESCE(pd.disc_amt, 0)) >= e.expected_amt
                                                    THEN 'PAID'
               WHEN COALESCE(pd.paid_amt, 0) > 0    THEN 'PARTIAL'
               ELSE                                      'UNPAID'
           END                                    AS status
    FROM students s
    LEFT JOIN branches b ON b.id = s."branchId"
    LEFT JOIN expected e ON e."studentId" = s.id
    LEFT JOIN paid     pd ON pd."studentId" = s.id
    WHERE s."tenantId" = p_tenant_id
      AND s.status = 'ACTIVE'
      AND (p_branch_id IS NULL OR s."branchId" = p_branch_id)
    ORDER BY balance DESC, full_name ASC;
$$;


-- ============================================================
-- 3. METHOD BREAKDOWN — exclude soft-deleted
-- ============================================================
CREATE OR REPLACE FUNCTION fn_payment_method_breakdown(
    p_tenant_id TEXT,
    p_branch_id TEXT,
    p_date_from DATE,
    p_date_to   DATE
)
RETURNS TABLE(
    method        TEXT,
    payment_count INT,
    total_amount  NUMERIC,
    pct_of_total  NUMERIC
)
LANGUAGE sql AS $$
    WITH base AS (
        SELECT p.method::text AS method, p.amount
        FROM payments p
        WHERE p."tenantId" = p_tenant_id
          AND p.status = 'PAID'
          AND p."deletedAt" IS NULL
          AND (p_branch_id IS NULL OR p."branchId" = p_branch_id)
          AND COALESCE(p."paidAt", p."createdAt") >= p_date_from::timestamp
          AND COALESCE(p."paidAt", p."createdAt") <  (p_date_to::date + INTERVAL '1 day')
    ),
    grand AS (SELECT COALESCE(SUM(amount), 0) AS total_amt FROM base)
    SELECT b.method,
           COUNT(*)::int                       AS payment_count,
           SUM(b.amount)::numeric              AS total_amount,
           CASE
             WHEN (SELECT total_amt FROM grand) > 0
                 THEN ROUND((SUM(b.amount) / (SELECT total_amt FROM grand)) * 100, 2)
             ELSE 0
           END::numeric                        AS pct_of_total
    FROM base b
    GROUP BY b.method
    ORDER BY SUM(b.amount) DESC;
$$;


-- ============================================================
-- 4. OUTSTANDING AGING — span seat + PG + tiffin
-- ============================================================
CREATE OR REPLACE FUNCTION fn_outstanding_aging(
    p_tenant_id TEXT,
    p_branch_id TEXT
)
RETURNS TABLE(
    bucket        TEXT,
    student_count INT,
    alloc_count   INT,
    total_amount  NUMERIC
)
LANGUAGE sql AS $$
    WITH allocations AS (
        SELECT sa."studentId", sa."monthlyRate", sa."nextDueDate"
          FROM seat_assignments sa
          JOIN seats st ON st.id = sa."seatId"
         WHERE sa."tenantId" = p_tenant_id
           AND sa.status IN ('TEMPORARY','CONFIRMED')
           AND (p_branch_id IS NULL OR st."branchId" = p_branch_id)
        UNION ALL
        SELECT pra."studentId", pra."monthlyRate", pra."nextDueDate"
          FROM pg_room_assignments pra
          JOIN pg_rooms r ON r.id = pra."roomId"
         WHERE pra."tenantId" = p_tenant_id
           AND pra.status = 'ACTIVE'
           AND (p_branch_id IS NULL OR r."branchId" = p_branch_id)
        UNION ALL
        SELECT ts."studentId", ts."monthlyRate", ts."nextDueDate"
          FROM tiffin_subscriptions ts
         WHERE ts."tenantId" = p_tenant_id
           AND ts.status = 'ACTIVE'
           AND (p_branch_id IS NULL OR ts."branchId" = p_branch_id)
    ),
    active AS (
        SELECT "studentId", "monthlyRate",
               CASE
                   WHEN "nextDueDate" IS NULL                         THEN 'CURRENT'
                   WHEN "nextDueDate"::date >= CURRENT_DATE           THEN 'CURRENT'
                   WHEN CURRENT_DATE - "nextDueDate"::date <= 30      THEN 'D_1_30'
                   WHEN CURRENT_DATE - "nextDueDate"::date <= 60      THEN 'D_31_60'
                   WHEN CURRENT_DATE - "nextDueDate"::date <= 90      THEN 'D_61_90'
                   ELSE                                                    'D_90_PLUS'
               END AS bucket
        FROM allocations
    )
    SELECT bucket::text,
           COUNT(DISTINCT "studentId")::int   AS student_count,
           COUNT(*)::int                      AS alloc_count,
           COALESCE(SUM("monthlyRate"), 0)::numeric AS total_amount
    FROM active
    GROUP BY bucket
    ORDER BY CASE bucket
        WHEN 'CURRENT'   THEN 1
        WHEN 'D_1_30'    THEN 2
        WHEN 'D_31_60'   THEN 3
        WHEN 'D_61_90'   THEN 4
        WHEN 'D_90_PLUS' THEN 5
    END;
$$;
