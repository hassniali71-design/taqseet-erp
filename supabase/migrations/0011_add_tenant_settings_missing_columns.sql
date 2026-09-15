-- 0001_foundation.sql's `tenant_settings` table never got two columns that exist on the
-- TypeScript `TenantSettings` type and are referenced by name in later migration comments
-- (0007_finance.sql §73) but were never actually added via ALTER TABLE — same class of gap as
-- 0010's missing `users.is_platform_owner`. Discovered while converting the Foundation layer
-- (tenants/users/roles/permissions/audit_logs) to real Supabase reads/writes.

alter table tenant_settings
  add column if not exists expense_approval_threshold numeric(12, 2) not null default 2000,
  add column if not exists whatsapp_notifications_enabled boolean not null default false;
