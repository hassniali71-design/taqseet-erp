-- Root-cause fix for the recurring "duplicate key value violates unique constraint
-- ...tenant_id_code_key" error: `nextTenantCode()` used to derive the next code from
-- `COUNT(*)` on the table. Any hard delete (e.g. `useDeleteCustomer`, a real customer
-- was hard-deleted for a real tenant earlier) leaves the row count permanently lower
-- than the highest code number already in use, so every subsequent insert regenerates
-- the exact same already-used code and fails, deterministically, every single time —
-- not a rare race. This replaces row-counting with a real atomic per-tenant sequence.

create table if not exists tenant_code_counters (
  tenant_id uuid not null references tenants (id) on delete cascade,
  entity text not null,
  counter integer not null default 0,
  primary key (tenant_id, entity)
);

alter table tenant_code_counters enable row level security;

drop policy if exists tenant_code_counters_select on tenant_code_counters;
create policy tenant_code_counters_select on tenant_code_counters for select
  using (tenant_id = current_tenant_id());

drop policy if exists tenant_code_counters_insert on tenant_code_counters;
create policy tenant_code_counters_insert on tenant_code_counters for insert
  with check (tenant_id = current_tenant_id());

drop policy if exists tenant_code_counters_update on tenant_code_counters;
create policy tenant_code_counters_update on tenant_code_counters for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

-- Atomic "give me the next number for this tenant+entity" — a single round trip,
-- Postgres serializes concurrent upserts on the same (tenant_id, entity) row, so this
-- can never hand out the same number twice, and it never looks at existing row counts
-- (so it can't be thrown off by a hard delete either).
create or replace function next_tenant_code_counter(p_tenant_id uuid, p_entity text)
returns integer
language sql
as $$
  insert into tenant_code_counters (tenant_id, entity, counter)
  values (p_tenant_id, p_entity, 1)
  on conflict (tenant_id, entity)
  do update set counter = tenant_code_counters.counter + 1
  returning counter;
$$;

-- Backfill: seed each tenant's counter from the highest code number already used for
-- that entity, not from the row count — this is what actually repairs any tenant that
-- already has a gap (e.g. from a past hard delete) instead of just preventing new ones.
insert into tenant_code_counters (tenant_id, entity, counter)
select tenant_id, 'customers', max(substring(code from '\d+$')::int)
from customers
where code ~ '\d+$'
group by tenant_id
on conflict (tenant_id, entity) do update set counter = greatest(tenant_code_counters.counter, excluded.counter);

insert into tenant_code_counters (tenant_id, entity, counter)
select tenant_id, 'products', max(substring(code from '\d+$')::int)
from products
where code ~ '\d+$'
group by tenant_id
on conflict (tenant_id, entity) do update set counter = greatest(tenant_code_counters.counter, excluded.counter);

insert into tenant_code_counters (tenant_id, entity, counter)
select tenant_id, 'suppliers', max(substring(code from '\d+$')::int)
from suppliers
where code ~ '\d+$'
group by tenant_id
on conflict (tenant_id, entity) do update set counter = greatest(tenant_code_counters.counter, excluded.counter);

insert into tenant_code_counters (tenant_id, entity, counter)
select tenant_id, 'partners', max(substring(code from '\d+$')::int)
from partners
where code ~ '\d+$'
group by tenant_id
on conflict (tenant_id, entity) do update set counter = greatest(tenant_code_counters.counter, excluded.counter);
