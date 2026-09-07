-- §21 Serial Number Management + §29 Inventory Ledger + §30 Stock Count. Mirrors
-- src/types/index.ts's ProductSerial/InventoryMovement exactly — see 0001_foundation.sql's
-- header comment for why (drop-in parity between Mock and Supabase).

create table if not exists product_serials (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  serial_number text not null,
  status text not null default 'available'
    check (status in ('available', 'sold', 'returned', 'inspection', 'damaged')),
  created_at timestamptz not null default now(),
  unique (tenant_id, serial_number)
);

create index if not exists idx_product_serials_tenant on product_serials (tenant_id);
create index if not exists idx_product_serials_product on product_serials (product_id);
create index if not exists idx_product_serials_tenant_status on product_serials (tenant_id, status);

create table if not exists inventory_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  product_id uuid not null references products (id) on delete cascade,
  type text not null check (type in ('receipt', 'sale', 'return', 'adjustment')),
  quantity integer not null,
  -- "before"/"after" are non-reserved keywords in Postgres (fine as plain column names) —
  -- kept unquoted to match src/types/index.ts's InventoryMovement field names exactly.
  before integer not null,
  after integer not null,
  user_id uuid references users (id) on delete set null,
  reference text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_inventory_movements_tenant on inventory_movements (tenant_id);
create index if not exists idx_inventory_movements_product on inventory_movements (product_id);
create index if not exists idx_inventory_movements_tenant_created
  on inventory_movements (tenant_id, created_at desc);

alter table product_serials enable row level security;
create policy product_serials_isolation on product_serials
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table inventory_movements enable row level security;
create policy inventory_movements_isolation on inventory_movements
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
