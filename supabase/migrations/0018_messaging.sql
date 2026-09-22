-- Real Twilio SMS/WhatsApp integration: installment due-soon/overdue reminders + new
-- employee/tenant login-credential delivery. Mirrors audit_logs' append-only, loose
-- entity/entity_id text pattern (0001_foundation.sql) rather than typed FKs per event kind,
-- and treasury_movements/audit_logs' tenant-scoped select+insert-only RLS shape.

create table if not exists message_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  channel text not null check (channel in ('sms', 'whatsapp')),
  event_type text not null
    check (event_type in ('installment_due_soon', 'installment_overdue', 'user_credentials')),
  -- Mirrors audit_logs.entity/entity_id: 'installment' + installments.id, or 'user' + users.id
  -- (also used for a brand-new tenant owner's account — logged under the NEW tenant's own
  -- tenant_id, same cross-tenant-write-into-target-tenant convention as recordCrossTenantAudit
  -- in platform-server.ts).
  entity text not null,
  entity_id text not null,
  recipient_phone text not null,
  status text not null check (status in ('sent', 'failed')),
  provider_message_sid text,
  error_message text,
  -- UTC calendar day of the send attempt — idempotency key alongside tenant/event/entity.
  -- Known simplification: UTC day, not the tenant's local (Africa/Cairo) day.
  sent_on date not null default (timezone('utc', now())::date),
  created_at timestamptz not null default now()
);

create index if not exists idx_message_logs_tenant_created
  on message_logs (tenant_id, created_at desc);

-- Idempotency: only a *successful* send blocks a same-day resend of the same reminder for the
-- same installment (or the same credentials send for the same user/tenant-owner). A failed
-- attempt does NOT block retry the same day.
create unique index if not exists uq_message_logs_dedupe
  on message_logs (tenant_id, event_type, entity_id, sent_on)
  where status = 'sent';

alter table message_logs enable row level security;
create policy message_logs_select on message_logs
  for select
  using (tenant_id = current_tenant_id());
create policy message_logs_insert on message_logs
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — append-only, same as audit_logs (0001_foundation.sql).
-- Every write in this feature actually goes through the service-role client (server functions
-- can't rely on RLS session context — see src/lib/twilio-server.ts), so this policy is a
-- defense-in-depth backstop, not the primary authorization mechanism, matching how
-- platform-server.ts's cross-tenant writes already work.

alter table tenant_settings
  add column if not exists sms_notifications_enabled boolean not null default false;

alter table users
  add column if not exists phone text;
