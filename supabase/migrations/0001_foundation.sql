-- Phase 1 foundation schema — spec §118 (Recommended Core Database Entities), the
-- tenants/users/roles/permissions/audit_logs subset only. Not yet applied to any
-- Supabase project (Phase 0 uses a local Mock data-store — see CLAUDE.md). Written now so
-- the Mock layer's shape matches this schema exactly and connecting Supabase later is a
-- drop-in swap of src/lib/data-store.ts's function bodies, not a redesign.
--
-- §133 non-negotiable rules enforced here: RLS mandatory (every tenant-scoped table),
-- no cross-tenant access, audit_logs has no update/delete policy at all (immutable).

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tenants
-- ---------------------------------------------------------------------------

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_name text not null,
  phone text not null,
  contact_email text,
  status text not null default 'trial' check (status in ('trial', 'active', 'expired', 'suspended')),
  plan_id text not null,
  subscription_start timestamptz not null,
  subscription_end timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_tenants_status on tenants (status);

-- §113 Configuration. Field-by-field usage is documented on the matching TypeScript type
-- (src/types/index.ts TenantSettings) — kept here in lockstep so Mock and Supabase never
-- drift apart.
create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants (id) on delete cascade,
  currency text not null default 'EGP',
  timezone text not null default 'Africa/Cairo',
  costing_method text not null default 'average' check (costing_method in ('average', 'last_purchase', 'fifo')),
  employee_discount_limit_pct numeric(5, 2) not null default 5,
  min_down_payment_pct numeric(5, 2) not null default 10,
  grace_period_days integer not null default 3,
  credit_hold_days integer not null default 7,
  late_fee_enabled boolean not null default false,
  return_period_days integer not null default 14
);

-- ---------------------------------------------------------------------------
-- Users / Roles / Permissions (§9, §10 — granular permissions, not role-level only)
-- ---------------------------------------------------------------------------

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  -- Links a business "user" row to the real Supabase Auth identity (§8). Nullable until
  -- Phase 1 wires up Supabase Auth sign-up/invite; Mock-mode rows leave this null.
  auth_user_id uuid references auth.users (id) on delete set null,
  full_name text not null,
  email text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

create index if not exists idx_users_tenant on users (tenant_id);
create index if not exists idx_users_auth_user on users (auth_user_id);

create table if not exists roles (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  is_system boolean not null default false,
  unique (tenant_id, name)
);

create index if not exists idx_roles_tenant on roles (tenant_id);

create table if not exists permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  label_ar text not null
);

create table if not exists role_permissions (
  role_id uuid not null references roles (id) on delete cascade,
  permission_id uuid not null references permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table if not exists user_roles (
  user_id uuid not null references users (id) on delete cascade,
  role_id uuid not null references roles (id) on delete cascade,
  primary key (user_id, role_id)
);

create index if not exists idx_user_roles_role on user_roles (role_id);

-- ---------------------------------------------------------------------------
-- Audit log (§12) — immutable: only insert + select policies are defined below,
-- no update/delete policy exists for any role, including the table owner's default grants
-- once RLS is enabled.
-- ---------------------------------------------------------------------------

create table if not exists audit_logs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  user_id uuid references users (id) on delete set null,
  action text not null,
  entity text not null,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_audit_logs_tenant_created on audit_logs (tenant_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Tenant resolution helper — every RLS policy below calls this instead of embedding the
-- users-table lookup inline. security definer + stable so it can read `users` (which itself
-- has RLS enabled) without recursing through the calling policy.
-- ---------------------------------------------------------------------------

create or replace function current_tenant_id()
returns uuid
language sql
security definer
stable
set search_path = public
as $$
  select tenant_id from users where auth_user_id = auth.uid() limit 1;
$$;

-- ---------------------------------------------------------------------------
-- Row Level Security (§120) — Tenant A must never read/update/delete Tenant B's rows,
-- even via a hand-crafted request. Platform-Owner cross-tenant access (§5, Phase 9 SaaS
-- Control Center) is deliberately NOT modeled here: it will use the Supabase service-role
-- key from a server-side function that bypasses RLS by design, never a client-side policy.
-- ---------------------------------------------------------------------------

alter table tenants enable row level security;
create policy tenants_isolation on tenants
  for all
  using (id = current_tenant_id())
  with check (id = current_tenant_id());

alter table tenant_settings enable row level security;
create policy tenant_settings_isolation on tenant_settings
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table users enable row level security;
create policy users_isolation on users
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table roles enable row level security;
create policy roles_isolation on roles
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table permissions enable row level security;
-- Global read-only catalog: every tenant may read it, none may write it from the client
-- (only a migration or the service role manages this table).
create policy permissions_read_all on permissions
  for select
  using (true);

alter table role_permissions enable row level security;
create policy role_permissions_isolation on role_permissions
  for all
  using (exists (select 1 from roles r where r.id = role_permissions.role_id and r.tenant_id = current_tenant_id()))
  with check (exists (select 1 from roles r where r.id = role_permissions.role_id and r.tenant_id = current_tenant_id()));

alter table user_roles enable row level security;
create policy user_roles_isolation on user_roles
  for all
  using (exists (select 1 from users u where u.id = user_roles.user_id and u.tenant_id = current_tenant_id()))
  with check (exists (select 1 from users u where u.id = user_roles.user_id and u.tenant_id = current_tenant_id()));

alter table audit_logs enable row level security;
create policy audit_logs_select on audit_logs
  for select
  using (tenant_id = current_tenant_id());
create policy audit_logs_insert on audit_logs
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy: audit_logs is append-only for every role except
-- the service role, which bypasses RLS entirely and is never exposed to the browser.

-- ---------------------------------------------------------------------------
-- Seed: §9 baseline system roles are tenant-scoped, so nothing to insert here without a
-- tenant row first — application code creates them per-tenant on tenant creation
-- (mirrors src/lib/data-store.ts's seedRoles). The permission catalog, however, is global
-- and seeded once here (idempotent — safe to re-run this migration file).
-- ---------------------------------------------------------------------------

insert into permissions (key, label_ar) values
  ('sale.create', 'إنشاء بيع'),
  ('sale.cancel', 'إلغاء بيع'),
  ('sale.discount.apply', 'تطبيق خصم'),
  ('sale.price.edit', 'تعديل سعر'),
  ('installment.create', 'إنشاء تقسيط'),
  ('installment.approve', 'اعتماد تقسيط'),
  ('collection.collect', 'تحصيل دفعة'),
  ('collection.reverse', 'عكس تحصيل'),
  ('return.create', 'إنشاء مرتجع'),
  ('return.approve', 'اعتماد مرتجع'),
  ('exchange.create', 'إنشاء استبدال'),
  ('installment.edit', 'تعديل تقسيط'),
  ('contract.restructure', 'إعادة هيكلة عقد'),
  ('contract.settle_early', 'تسوية مبكرة'),
  ('customer.balance.adjust', 'تعديل رصيد عميل'),
  ('inventory.adjust', 'تعديل مخزون'),
  ('expense.approve', 'اعتماد مصروف'),
  ('shift.close', 'إقفال وردية'),
  ('day.close', 'إقفال يوم'),
  ('month.close', 'إقفال شهر'),
  ('credit_limit.override', 'تجاوز حد ائتمان'),
  ('discount.override', 'تجاوز حد خصم'),
  ('support_access.use', 'دخول دعم فني (Impersonation)')
on conflict (key) do nothing;
