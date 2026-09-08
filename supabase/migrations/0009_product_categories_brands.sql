-- §19/§118 "simple addable list" for product categories and brands — spec §131 gap-list item.
-- Deliberately NOT a foreign key onto products.category/products.brand: those stay plain text
-- (see 0002_customers_products.sql), matching src/lib/data-store.ts's registerProductCategory/
-- registerProductBrand, which auto-register any newly typed value instead of blocking it behind
-- a strict relation. §20/§133 governance: no hard delete — `active` is the only retirement path.

create table if not exists product_categories (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_product_categories_tenant on product_categories (tenant_id);

create table if not exists product_brands (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, name)
);

create index if not exists idx_product_brands_tenant on product_brands (tenant_id);

-- RLS (§120) — same current_tenant_id() helper defined in 0001_foundation.sql.

alter table product_categories enable row level security;
create policy product_categories_isolation on product_categories
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table product_brands enable row level security;
create policy product_brands_isolation on product_brands
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
