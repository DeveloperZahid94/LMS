-- 025_tiffin_ops.sql
-- Tiffin operations: delivery assignee (free-text), pause tracking + pause history.
-- Idempotent. Run AFTER 024_tiffin_paused.sql has committed.

-- ---- New columns on tiffin_subscriptions ----
ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "deliveryAssignee" TEXT;
ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "deliveryPhone"    TEXT;
ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "pausedDays"       INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tiffin_subscriptions" ADD COLUMN IF NOT EXISTS "updatedAt"        TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- ---- Pause history (one row per pause period; open row = currently paused) ----
CREATE TABLE IF NOT EXISTS "tiffin_pauses" (
    "id"             TEXT NOT NULL,
    "tenantId"       TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "pausedAt"       TIMESTAMP(3) NOT NULL,
    "resumedAt"      TIMESTAMP(3),
    "days"           INTEGER,
    "reason"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tiffin_pauses_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "tiffin_pauses_tenantId_subscriptionId_idx"
    ON "tiffin_pauses" ("tenantId", "subscriptionId");

DO $$ BEGIN
    ALTER TABLE "tiffin_pauses"
        ADD CONSTRAINT "tiffin_pauses_subscriptionId_fkey"
        FOREIGN KEY ("subscriptionId") REFERENCES "tiffin_subscriptions" ("id") ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;
