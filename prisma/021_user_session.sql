-- Single-session enforcement: tracks the currently-valid session token per user.
-- When a tenant disallows multiple sessions, each login writes a fresh sessionId
-- here and embeds it in the JWT (`sid`). Requests whose token sid != this value
-- are rejected, logging out the previous device. Null = enforcement off.
ALTER TABLE "users" ADD COLUMN IF NOT EXISTS "sessionId" TEXT;
