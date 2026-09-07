-- Lean Customers/Products slice for the demo increment — spec §14 (Customer Module, subset)
-- and §19 (Product Master, subset). Not yet applied to any Supabase project (Phase 0/2 use a
-- local Mock data-store — see CLAUDE.md). Mirrors src/types/index.ts's Customer/Product shapes
-- exactly so connecting Supabase later is a drop-in swap, per the same rule as
-- 0001_foundation.sql.
--
-- Deliberately NOT included yet (real Phase 2/3 work): customer_documents, guarantors,
-- customer_credit_profiles, customer_risk_scores, product_categories, brands, units,
-- product_serials, product_images, product_prices (per-customer pricing). §133: no hard
-- delete — both tables use a status/active flag instead.

create table if not exists customers (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null,
  name text not null,
  phone text not null,
  alt_phone text,
  address text,
  notes text,
  -- §16 Credit Profile, used by Phase 4's Credit Check.
  credit_limit numeric(12, 2) not null default 0,
  status text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_customers_tenant on customers (tenant_id);
create index if not exists idx_customers_tenant_status on customers (tenant_id, status);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  code text not null,
  name text not null,
  brand text,
  model text,
  category text,
  unit text not null default 'قطعة',
  cost_price numeric(12, 2) not null default 0,
  cash_price numeric(12, 2) not null default 0,
  installment_price numeric(12, 2) not null default 0,
  min_stock integer not null default 0,
  max_stock integer not null default 0,
  warranty_months integer,
  serial_required boolean not null default false,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, code)
);

create index if not exists idx_products_tenant on products (tenant_id);
create index if not exists idx_products_tenant_active on products (tenant_id, active);

-- RLS (§120) — same current_tenant_id() helper defined in 0001_foundation.sql.

alter table customers enable row level security;
create policy customers_isolation on customers
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table products enable row level security;
create policy products_isolation on products
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
