-- Platform Control Room — real per-tenant storage-size metric (§9 Phase 9), so the platform
-- owner can see roughly how much data each client has accumulated (MB up to GB), not just row
-- counts. Sums pg_column_size() across every row of every table that has a `tenant_id` column,
-- discovered dynamically via information_schema rather than a hardcoded table list — so this
-- keeps working correctly as new tenant-scoped tables get added later without another migration.
--
-- p_tenant_id defaults to null, which returns every tenant's total in ONE pass (each table
-- scanned once, not once per tenant) — used by the control room's tenant list. Passing a single
-- tenant_id filters every per-table scan with `where tenant_id = $1`, which uses that table's
-- existing `idx_..._tenant` index — used by the support/monitoring detail page.
--
-- security definer so it can read every tenant's rows regardless of the calling role's RLS —
-- but it must NEVER be reachable via the anon/authenticated Supabase roles (that would let any
-- signed-in tenant user query another tenant's storage total, a minor but real cross-tenant
-- leak), so execute is revoked from public and granted only to service_role. Called exclusively
-- from src/lib/platform-server.ts using the service-role key, same as this file's siblings.

create or replace function platform_tenant_storage_bytes(p_tenant_id uuid default null)
returns table (tenant_id uuid, bytes bigint)
language plpgsql
security definer
set search_path = public
as $$
declare
  tbl record;
begin
  create temporary table _tenant_storage_acc (tenant_id uuid, bytes bigint) on commit drop;

  for tbl in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables t
      on t.table_schema = c.table_schema and t.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'tenant_id'
      and t.table_type = 'BASE TABLE'
  loop
    execute format(
      'insert into _tenant_storage_acc (tenant_id, bytes)
       select tt.tenant_id, coalesce(sum(pg_column_size(tt.*)), 0)
       from %I tt
       where tt.tenant_id is not null
         and ($1 is null or tt.tenant_id = $1)
       group by tt.tenant_id',
      tbl.table_name
    ) using p_tenant_id;
  end loop;

  return query
    select acc.tenant_id, sum(acc.bytes)::bigint as bytes
    from _tenant_storage_acc acc
    group by acc.tenant_id;
end;
$$;

revoke execute on function platform_tenant_storage_bytes(uuid) from public;
grant execute on function platform_tenant_storage_bytes(uuid) to service_role;
