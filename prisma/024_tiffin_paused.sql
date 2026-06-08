-- 024_tiffin_paused.sql
-- Add the PAUSED value to TiffinStatus so tiffin subscriptions can be paused/resumed.
-- NOTE: a new enum value must be committed before it can be used, so any code/data
-- that references 'PAUSED' must run after this migration (its own command).

ALTER TYPE "TiffinStatus" ADD VALUE IF NOT EXISTS 'PAUSED';
