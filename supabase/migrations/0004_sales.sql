-- §15 Guarantors + §32/§34 Cash Sale. Mirrors src/types/index.ts's Guarantor/Sale exactly.
--
-- `items` is stored as jsonb here to match the deliberate Mock-stage simplification documented
-- on the `Sale` type (line items nested in the sale document rather than a normalized
-- `sale_items` table). Promoting it to a real child table is real Phase work, not a schema
-- change this migration should pre-empt — every reader already goes through one `sales` query.

create table if not exists guarantors (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  customer_id uuid not null references customers (id) on delete cascade,
  name text not null,
  phone text not null,
  relationship text,
  created_at timestamptz not null default now()
);

create index if not exists idx_guarantors_tenant on guarantors (tenant_id);
create index if not exists idx_guarantors_customer on guarantors (customer_id);

create table if not exists sales (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  invoice_number text not null,
  customer_id uuid references customers (id) on delete set null,
  customer_name text not null,
  items jsonb not null,
  subtotal numeric(12, 2) not null,
  discount_pct numeric(5, 2) not null default 0,
  discount_amount numeric(12, 2) not null default 0,
  total numeric(12, 2) not null,
  user_id uuid references users (id) on delete set null,
  status text not null default 'completed' check (status in ('completed', 'cancelled')),
  created_at timestamptz not null default now(),
  unique (tenant_id, invoice_number)
);

create index if not exists idx_sales_tenant on sales (tenant_id);
create index if not exists idx_sales_customer on sales (customer_id);
create index if not exists idx_sales_tenant_created on sales (tenant_id, created_at desc);

alter table guarantors enable row level security;
create policy guarantors_isolation on guarantors
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table sales enable row level security;
create policy sales_isolation on sales
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
