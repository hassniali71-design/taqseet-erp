-- §61-§64 Purchasing — small informational fields on the purchase invoice, added on the
-- owner's request: when the invoice was actually issued (defaults to the row's created_at
-- day if omitted) and an optional supplier-agreed return window in days. Neither field
-- feeds into any calculation elsewhere (no automatic "purchase return deadline" enforcement
-- yet) — purely informational on the invoice itself for now.
alter table purchases add column if not exists issue_date date;
alter table purchases add column if not exists return_period_days integer;
