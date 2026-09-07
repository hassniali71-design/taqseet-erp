-- §60-§65 Purchasing — Suppliers, Purchases (Request + Goods Receipt combined for this Mock
-- stage, see the `Purchase` type comment in src/types/index.ts), Supplier Payments. Not yet
-- applied to any Supabase project (Phase 0-5 use a local Mock data-store — see CLAUDE.md).
-- Mirrors src/types/index.ts's Supplier/Purchase/SupplierPayment exactly, same drop-in-swap
-- rule as every earlier migration in this folder.
--
-- `items` on purchases is jsonb for the same reason as sales.items (0004) and
-- installment_contracts.items (0005) — deliberate Mock-stage simplification, not a schema this
-- migration should pre-empt normalizing. §11: no hard delete — suppliers use `active`;
-- purchases and supplier_payments are append-only (no update/delete policy, same as sales and
-- installment_payments).

create table if not exists suppliers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null,
  name text not null,
  phone text not null,
  address text,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_suppliers_tenant on suppliers (tenant_id);
create index if not exists idx_suppliers_tenant_active on suppliers (tenant_id, active);

create table if not exists purchases (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  purchase_number text not null,
  supplier_id uuid not null references suppliers (id) on delete restrict,
  supplier_name text not null,
  items jsonb not null,
  total numeric(12, 2) not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, purchase_number)
);

create index if not exists idx_purchases_tenant on purchases (tenant_id);
create index if not exists idx_purchases_supplier on purchases (supplier_id);
create index if not exists idx_purchases_tenant_created on purchases (tenant_id, created_at desc);

-- §65 — no due-date schedule on the supplier side in this Mock (unlike customer installments);
-- a payment simply reduces the running balance (sum(purchases.total) - sum(payments.amount)),
-- computed on read in data-store.ts's getSupplierBalance, never stored as a running total here.
create table if not exists supplier_payments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  supplier_id uuid not null references suppliers (id) on delete restrict,
  amount numeric(12, 2) not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_payments_tenant on supplier_payments (tenant_id);
create index if not exists idx_supplier_payments_supplier on supplier_payments (supplier_id);

alter table suppliers enable row level security;
create policy suppliers_isolation on suppliers
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table purchases enable row level security;
create policy purchases_select on purchases
  for select
  using (tenant_id = current_tenant_id());
create policy purchases_insert on purchases
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — a purchase's goods receipt is append-only, same rule
-- as sales (0004) and installment_payments (0005).

alter table supplier_payments enable row level security;
create policy supplier_payments_select on supplier_payments
  for select
  using (tenant_id = current_tenant_id());
create policy supplier_payments_insert on supplier_payments
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — same immutable-payment-record rule as
-- installment_payments (0005).
