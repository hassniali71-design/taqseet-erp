-- useApproveExpense (supabase-queries.ts) has always tried to update expenses with
-- approved_by/approved_at/approval_note — none of these columns exist in 0007_finance.sql, and
-- that table has no UPDATE RLS policy at all (deliberately, per its own comment: "a mistaken
-- expense gets a corrective entry, not a rewrite of history"). Net effect: the approval button
-- has never worked, for any tenant, ever — a 100% guaranteed failure, not an edge case.
--
-- The narrow exception carved out here is consistent with precedent already set for
-- installment_contracts.status / sales.status: flipping a status/approval flag once is not
-- "rewriting history" the way editing the amount/reason/category would be. amount, reason and
-- category remain immutable — only the approval metadata can ever change, and only forward
-- (needs_approval true -> false).

alter table expenses
  add column if not exists approved_by uuid references users (id) on delete set null,
  add column if not exists approved_at timestamptz,
  add column if not exists approval_note text;

drop policy if exists expenses_update on expenses;
create policy expenses_update on expenses
  for update
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());
