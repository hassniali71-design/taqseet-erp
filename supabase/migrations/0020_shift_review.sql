-- Treasury/Partners radical redesign (5/5): richer shift-close UI needs a persisted "this
-- discrepancy has been reviewed" flag so the dismissible alert card on /treasury survives a
-- reload and stays in sync across devices (the whole point of this Supabase-backed project —
-- a localStorage-only flag would defeat that). `shifts` already carries an unrestricted "for
-- all" RLS policy (0007_finance.sql), so no policy change is needed here — only the two
-- columns themselves. Reused, not reinvented: closing_diff/closing_reason (already computed
-- and required by useCloseShift whenever there's a mismatch) are exactly what the reviewer is
-- reviewing; this migration adds nothing to that computation, only a record of "someone looked
-- at this and it's handled."

alter table shifts add column if not exists reviewed_at timestamptz;
alter table shifts add column if not exists reviewed_by uuid references users (id) on delete set null;
