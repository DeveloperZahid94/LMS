-- ============================================================================
-- LMS Platform — migration 007: reporting functions
--
-- Adds three Postgres functions used by the Reports screen. Keeping the
-- aggregation in the database (instead of in NestJS) means the API hands the
-- function the filters and returns ready-to-render rows, which keeps the
-- backend small and lets us tune indexes per query.
--
-- Functions
--   fn_payments_timeseries(tenant, branch, from, to, bucket)
--       — payments grouped by day / week / month / year; one row per bucket
--       — bucket = 'day' | 'week' | 'month' | 'year' (anything else falls
--         back to 'day' to avoid an empty result on bad input)
--
--   fn_student_payment_summary(tenant, branch, from, to)
--       — one row per ACTIVE student with expected vs. paid in the window
--       — status: 'PAID' (paid >= expected and expected > 0)
--                 'PARTIAL' (0 < paid < expected, or paid > 0 with no expected)
--                 'UNPAID' (paid = 0)
--       — "expected" = SUM(monthlyRate) across the student's active seat
--         allocations. Treated as a monthly billing baseline; for ranges
--         that span multiple months the caller multiplies as needed.
--
--   fn_payment_method_breakdown(tenant, branch, from, to)
--       — collections by payment method (only PAID rows), incl. pct of total
--
-- NOTE: Prisma stores its UUID fields as TEXT (no @db.Uuid), so these
-- functions take/return TEXT for tenantId/branchId/studentId, not the
-- native UUID type. Trying to compare a UUID parameter against a TEXT
-- column produces: "operator does not exist: text = uuid".
--
-- USAGE
--   psql -d lms -f prisma/007_reports_functions.sql
--
-- IDEMPOTENT — uses CREATE OR REPLACE FUNCTION.
-- ============================================================================

-- Drop old function signatures (UUID variants from earlier revision) so that
-- CREATE OR REPLACE with new TEXT signatures doesn't conflict.
DROP FUNCTION IF EXISTS fn_payments_timeseries(UUID, UUID, DATE, DATE, TEXT);
DROP FUNCTION IF EXISTS fn_student_payment_summary(UUID, UUID, DATE, DATE);
DROP FUNCTION IF EXISTS fn_payment_method_breakdown(UUID, UUID, DATE, DATE);


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
          AND ($2 IS NULL OR p."branchId" = $2)
          AND COALESCE(p."paidAt", p."createdAt") >= $3::timestamp
          AND COALESCE(p."paidAt", p."createdAt") <  ($4::date + INTERVAL '1 day')
        GROUP BY 1
        ORDER BY 1
    $sql$, v_bucket)
    USING p_tenant_id, p_branch_id, p_date_from, p_date_to;
END $$;


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
        SELECT sa."studentId",
               SUM(COALESCE(sa."monthlyRate", 0)) AS expected_amt
        FROM seat_assignments sa
        WHERE sa."tenantId" = p_tenant_id
          AND sa.status IN ('TEMPORARY','CONFIRMED')
        GROUP BY sa."studentId"
    ),
    paid AS (
        SELECT p."studentId",
               COUNT(*) FILTER (WHERE p.status = 'PAID')::int AS pay_count,
               SUM(p.amount) FILTER (WHERE p.status = 'PAID')    AS paid_amt,
               SUM(p.amount) FILTER (WHERE p.status = 'PENDING') AS pending_amt,
               MAX(COALESCE(p."paidAt", p."createdAt"))
                   FILTER (WHERE p.status = 'PAID')              AS last_paid
        FROM payments p
        WHERE p."tenantId" = p_tenant_id
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
           (COALESCE(e.expected_amt, 0) - COALESCE(pd.paid_amt, 0))::numeric AS balance,
           COALESCE(pd.pay_count, 0)              AS payment_count,
           pd.last_paid::timestamp                AS last_payment_at,
           CASE
               WHEN COALESCE(e.expected_amt, 0) > 0
                    AND COALESCE(pd.paid_amt, 0) >= e.expected_amt
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


-- Helpful supporting indexes for the queries above.
CREATE INDEX IF NOT EXISTS "payments_tenantId_paidAt_idx"
    ON "payments" ("tenantId", "paidAt");
CREATE INDEX IF NOT EXISTS "payments_tenantId_status_paidAt_idx"
    ON "payments" ("tenantId", "status", "paidAt");
