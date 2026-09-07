-- §79-§86 After Sales — Returns (cash sales only in this Mock increment), Exchange, Delivery
-- Orders. Not yet applied to any Supabase project (Phase 0-7 use a local Mock data-store — see
-- CLAUDE.md). Mirrors src/types/index.ts's SaleReturn/ReturnItem/ExchangeTransaction/
-- DeliveryOrder exactly, same drop-in-swap rule as every earlier migration in this folder.
--
-- §11 governance: the original `sales` row is never edited or deleted by a return or exchange —
-- both are new, separate records referencing it. `delivery_orders` moves through its own
-- forward-only state machine (scheduled → out_for_delivery → delivered), never deleted.
-- Warranty (§86) has no table at all — it's derived on read from `product_serials` +
-- `products.warranty_months` + the sale/contract that included the serial
-- (getWarrantyInfo in data-store.ts).

create table if not exists sale_returns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  return_number text not null,
  sale_id uuid not null references sales (id) on delete restrict,
  customer_id uuid references customers (id) on delete set null,
  customer_name text not null,
  items jsonb not null,
  refund_amount numeric(12, 2) not null,
  reason text not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, return_number)
);

create index if not exists idx_sale_returns_tenant on sale_returns (tenant_id);
create index if not exists idx_sale_returns_sale on sale_returns (sale_id);

-- §82 — returned_items/new_items are jsonb for the same reason as sales.items (0004): a
-- deliberate Mock-stage simplification, not a schema this migration should pre-empt normalizing.
create table if not exists exchange_transactions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  exchange_number text not null,
  original_sale_id uuid not null references sales (id) on delete restrict,
  returned_items jsonb not null,
  new_items jsonb not null,
  price_difference numeric(12, 2) not null,
  reason text not null,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, exchange_number)
);

create index if not exists idx_exchange_transactions_tenant on exchange_transactions (tenant_id);
create index if not exists idx_exchange_transactions_sale on exchange_transactions (original_sale_id);

create table if not exists delivery_orders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  sale_id uuid not null references sales (id) on delete restrict,
  customer_name text not null,
  address text not null,
  scheduled_date timestamptz not null,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'out_for_delivery', 'delivered')),
  delivered_at timestamptz,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_delivery_orders_tenant on delivery_orders (tenant_id);
create index if not exists idx_delivery_orders_sale on delivery_orders (sale_id);

alter table sale_returns enable row level security;
create policy sale_returns_select on sale_returns
  for select
  using (tenant_id = current_tenant_id());
create policy sale_returns_insert on sale_returns
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — a return is append-only, same rule as sales/payments.

alter table exchange_transactions enable row level security;
create policy exchange_transactions_select on exchange_transactions
  for select
  using (tenant_id = current_tenant_id());
create policy exchange_transactions_insert on exchange_transactions
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — same immutable-record rule as sale_returns.

alter table delivery_orders enable row level security;
create policy delivery_orders_isolation on delivery_orders
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
