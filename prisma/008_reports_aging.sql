-- ============================================================================
-- LMS Platform — migration 008: outstanding-aging buckets for Reports screen
--
-- Adds fn_outstanding_aging() — classic A/R aging on each active seat
-- allocation, bucketed by how many days past `nextDueDate` we are today.
-- Buckets:
--   CURRENT     — not yet overdue (nextDueDate >= today, or NULL)
--   D_1_30      — 1 to 30 days overdue
--   D_31_60     — 31 to 60 days overdue
--   D_61_90     — 61 to 90 days overdue
--   D_90_PLUS   — more than 90 days overdue
--
-- For each bucket we return:
--   student_count  — distinct students with at least one allocation in this bucket
--   alloc_count    — total allocations in this bucket
--   total_amount   — SUM(monthlyRate) — i.e. the at-risk monthly billing value
--
-- USAGE
--   psql -d lms -f prisma/008_reports_aging.sql
-- ============================================================================

DROP FUNCTION IF EXISTS fn_outstanding_aging(TEXT, TEXT);

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
    WITH active AS (
        SELECT sa."studentId",
               sa.id              AS alloc_id,
               sa."monthlyRate",
               sa."nextDueDate",
               CASE
                   WHEN sa."nextDueDate" IS NULL                         THEN 'CURRENT'
                   WHEN sa."nextDueDate"::date >= CURRENT_DATE           THEN 'CURRENT'
                   WHEN CURRENT_DATE - sa."nextDueDate"::date <= 30      THEN 'D_1_30'
                   WHEN CURRENT_DATE - sa."nextDueDate"::date <= 60      THEN 'D_31_60'
                   WHEN CURRENT_DATE - sa."nextDueDate"::date <= 90      THEN 'D_61_90'
                   ELSE                                                       'D_90_PLUS'
               END AS bucket
        FROM seat_assignments sa
        JOIN seats st ON st.id = sa."seatId"
        WHERE sa."tenantId" = p_tenant_id
          AND sa.status IN ('TEMPORARY','CONFIRMED')
          AND (p_branch_id IS NULL OR st."branchId" = p_branch_id)
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
