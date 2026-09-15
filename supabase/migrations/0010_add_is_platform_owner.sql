-- 0001_foundation.sql's `users` table was missing `is_platform_owner` — it exists on the
-- TypeScript `User` type (Phase 9 sentinel for the platform-operator account) but was never
-- added to the SQL schema. Discovered while wiring up real Supabase Auth (this migration must
-- run before any INSERT into `users` that sets this column).

alter table users add column if not exists is_platform_owner boolean not null default false;
