-- 017_student_doc_images.sql
-- Store student ID-document images (Aadhaar front/back, Voter ID) alongside the
-- existing photoUrl / idProofUrl. Images are saved as base64 data URLs. Idempotent.

ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "aadhaarFrontUrl" TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "aadhaarBackUrl"  TEXT;
ALTER TABLE "students" ADD COLUMN IF NOT EXISTS "voterIdUrl"      TEXT;
