-- Three independent, narrow schema changes bundled into one migration (apply once via the
-- Supabase SQL Editor, same as 0010-0012 before it):
--
-- 1) treasury_movements.type CHECK constraint was missing 'return', 'exchange', and the new
--    'transfer' type (§68 shift-close cash allocation). Every insert of those types was being
--    silently rejected by Postgres and swallowed by postFinancials' best-effort try/catch —
--    meaning returns/exchanges never actually reached the treasury ledger despite the
--    application code looking correct. This widens the constraint to match reality.
--
-- 2) audit_logs was deliberately insert/select-only (0001_foundation.sql) as an immutable
--    trail. The owner now explicitly wants a password-gated way to prune it from the UI, so
--    this adds a tenant-scoped delete policy — a deliberate, explicit reversal of that one
--    governance decision for this table specifically, not a blanket change to the "no hard
--    delete" rule for financial/ledger tables (those remain untouched).
--
-- 3) sales.return_window_days: optional per-invoice override of the tenant-wide
--    return_period_days default, settable by the seller at the point of sale.

alter table treasury_movements drop constraint if exists treasury_movements_type_check;
alter table treasury_movements
  add constraint treasury_movements_type_check
  check (type in ('opening', 'sale', 'collection', 'purchase_payment', 'expense', 'return', 'exchange', 'transfer'));

drop policy if exists audit_logs_delete on audit_logs;
create policy audit_logs_delete on audit_logs
  for delete
  using (tenant_id = current_tenant_id());

alter table sales add column if not exists return_window_days integer;
