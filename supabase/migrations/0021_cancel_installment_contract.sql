-- Lets the owner fully cancel/reverse an installment contract created by mistake, gated by
-- owner-password re-confirmation in the UI, but ONLY while zero payments have been collected on
-- it yet (enforced in application code, not here) — the safe, unambiguous "as if it never
-- happened" case. Cancelling reverses: stock/serial availability, the treasury/journal effect of
-- any down payment, and any partner settlement tied to the contract (via a new offsetting
-- `contract_cancellation` row, never an update/delete of the original append-only
-- `sale_settlement` row — same no-hard-delete governance rule used everywhere else in this
-- project).

alter table installment_contracts
  drop constraint if exists installment_contracts_status_check;
alter table installment_contracts
  add constraint installment_contracts_status_check
  check (status in ('active', 'partially_paid', 'overdue', 'restructured', 'settled', 'settled_early', 'cancelled'));

alter table partner_transactions
  drop constraint if exists partner_transactions_type_check;
alter table partner_transactions
  add constraint partner_transactions_type_check
  check (type in ('funding', 'withdrawal', 'sale_settlement', 'adjustment', 'profit_payout', 'expense_share', 'contract_cancellation'));
