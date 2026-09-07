-- §35-§57 Installments — the product's central feature. Mirrors src/types/index.ts's
-- InstallmentPlan/InstallmentContract/Installment/InstallmentPayment/PromiseToPay/
-- RestructureEvent exactly. Not yet applied to any Supabase project (Phase 0-4 use a local
-- Mock data-store — see CLAUDE.md), written now so the Mock layer's shape matches this schema
-- and connecting Supabase later is a drop-in swap, per the same rule as 0001-0004.
--
-- §114 Historical Snapshot: `installment_contracts.plan_duration_months`/`plan_rate_pct` are
-- copied from the plan at creation time and never re-read from it afterward — editing or
-- deactivating a plan must never change an existing contract's numbers. §11: no hard delete
-- anywhere here — plans use `active`, everything else is append-only or moves through its
-- own state machine (never a delete statement).
--
-- `items` on installment_contracts is jsonb for the same reason as sales.items (0004) — a
-- deliberate Mock-stage simplification, not a schema this migration should pre-empt normalizing.

create table if not exists installment_plans (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  duration_months integer not null check (duration_months > 0),
  rate_pct numeric(5, 2) not null check (rate_pct >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_installment_plans_tenant on installment_plans (tenant_id);

create table if not exists installment_contracts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contract_number text not null,
  customer_id uuid not null references customers (id) on delete restrict,
  customer_name text not null,
  items jsonb not null,
  cash_subtotal numeric(12, 2) not null,
  down_payment numeric(12, 2) not null,
  principal numeric(12, 2) not null,
  plan_id uuid not null references installment_plans (id) on delete restrict,
  -- §114 snapshot — deliberately duplicated from installment_plans at creation time.
  plan_duration_months integer not null,
  plan_rate_pct numeric(5, 2) not null,
  finance_amount numeric(12, 2) not null,
  total_amount numeric(12, 2) not null,
  installment_amount numeric(12, 2) not null,
  status text not null default 'active'
    check (status in ('active', 'partially_paid', 'overdue', 'restructured', 'settled', 'settled_early')),
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, contract_number)
);

create index if not exists idx_installment_contracts_tenant on installment_contracts (tenant_id);
create index if not exists idx_installment_contracts_customer on installment_contracts (customer_id);
create index if not exists idx_installment_contracts_tenant_status on installment_contracts (tenant_id, status);

-- §44 state machine. `status` here is the last *persisted* transition only (scheduled → paid,
-- or waived/rescheduled) — "due"/"overdue"/"partially_paid" as far as the UI shows them are
-- time-dependent and computed on read (see getEffectiveInstallmentStatus in data-store.ts),
-- never written by a cron job or trigger. `partially_paid` remains a valid stored value too,
-- set the moment a payment lands that doesn't fully cover the installment.
create table if not exists installments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contract_id uuid not null references installment_contracts (id) on delete cascade,
  seq integer not null,
  due_date timestamptz not null,
  amount numeric(12, 2) not null,
  paid_amount numeric(12, 2) not null default 0,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'due', 'partially_paid', 'paid', 'overdue', 'waived', 'rescheduled')),
  created_at timestamptz not null default now()
);

create index if not exists idx_installments_tenant on installments (tenant_id);
create index if not exists idx_installments_contract on installments (contract_id, seq);

-- §54/§55 Collection Receipt — `receipt_number` is sequential/unique/immutable: no update or
-- delete policy is defined below for this table, matching "Employee cannot edit, cannot be
-- deleted." `allocations` records exactly how this one payment was split across installments
-- (§46 Oldest-Due-First is the application-level default, enforced in code, not here).
create table if not exists installment_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contract_id uuid not null references installment_contracts (id) on delete restrict,
  receipt_number text not null,
  amount numeric(12, 2) not null,
  allocations jsonb not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, receipt_number)
);

create index if not exists idx_installment_payments_tenant on installment_payments (tenant_id);
create index if not exists idx_installment_payments_contract on installment_payments (contract_id);

-- §51 Promise to Pay. `status` starts 'pending'; a payment landing on/before `promise_date`
-- flips it to 'kept' (application logic, in collectPayment). A promise whose date has passed
-- while still 'pending' reads as 'failed' on the client (computed, same as installment overdue)
-- without ever being written that way — so a late payment can still legitimately arrive and
-- flip a promise straight to 'kept' even after its date has technically passed unseen.
create table if not exists promises_to_pay (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contract_id uuid not null references installment_contracts (id) on delete cascade,
  promise_date timestamptz not null,
  expected_amount numeric(12, 2) not null,
  notes text,
  user_id uuid references users (id) on delete set null,
  status text not null default 'pending' check (status in ('pending', 'kept', 'failed')),
  created_at timestamptz not null default now()
);

create index if not exists idx_promises_to_pay_tenant on promises_to_pay (tenant_id);
create index if not exists idx_promises_to_pay_contract on promises_to_pay (contract_id);

-- §48 Restructuring — the audit trail linking an old, now-`rescheduled` set of installments to
-- the new ones appended for the remaining balance. Never itself updated or deleted.
create table if not exists restructure_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  contract_id uuid not null references installment_contracts (id) on delete cascade,
  old_installment_ids uuid[] not null,
  remaining_amount numeric(12, 2) not null,
  new_duration_months integer not null,
  reason text not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_restructure_events_tenant on restructure_events (tenant_id);
create index if not exists idx_restructure_events_contract on restructure_events (contract_id);

alter table installment_plans enable row level security;
create policy installment_plans_isolation on installment_plans
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table installment_contracts enable row level security;
create policy installment_contracts_isolation on installment_contracts
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table installments enable row level security;
create policy installments_isolation on installments
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table installment_payments enable row level security;
create policy installment_payments_select on installment_payments
  for select
  using (tenant_id = current_tenant_id());
create policy installment_payments_insert on installment_payments
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy: a collection receipt is append-only (§55), same rule
-- as audit_logs in 0001_foundation.sql.

alter table promises_to_pay enable row level security;
create policy promises_to_pay_isolation on promises_to_pay
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table restructure_events enable row level security;
create policy restructure_events_select on restructure_events
  for select
  using (tenant_id = current_tenant_id());
create policy restructure_events_insert on restructure_events
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — same immutable-audit-trail rule as installment_payments.
