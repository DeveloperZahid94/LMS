-- 016_student_pending.sql
-- Add PENDING to StudentStatus so a registration can be saved as a draft
-- (status PENDING) and completed later. No backfill — existing rows stay ACTIVE.

ALTER TYPE "StudentStatus" ADD VALUE IF NOT EXISTS 'PENDING';
