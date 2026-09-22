-- Treasury/Partners radical redesign (post-demo request): clarify that Partners are the real
-- funding source for purchasing while Treasury stays a separate, untouched-by-purchases ledger,
-- plus two capabilities the user explicitly called "forgotten": a distinct profit-payout
-- transaction type (sourced from a real treasury account, unlike `withdrawal` which never
-- touches treasury) and letting an expense be charged to selected partners instead of only to a
-- treasury account. Kept deliberately narrow per the user's own two decisions: partner↔deal
-- linkage stays at sale time (not purchase time), and the two ledgers stay fully separate (no
-- balance merge) — only an informational combined card is added in the UI, no schema for it.
--
-- 1) partner_transactions.type widened: 'profit_payout' (real treasury-backed profit
--    disbursement, distinct from 'withdrawal') and 'expense_share' (this partner's slice of an
--    expense charged to partners instead of treasury). related_expense_id links the latter back
--    to its expenses row for traceability, same pattern as related_sale_id/related_contract_id.
--
-- 2) treasury_movements.type widened: 'partner_profit_payout' — the treasury-side half of a
--    profit payout, a real debit from the chosen account(s), separate from 'expense'/'transfer'
--    so /accounting and shift-close math can tell it apart.
--
-- 3) expenses.account_id becomes nullable + a new charge_to column ('treasury' default, or
--    'partners'). A CHECK enforces exactly one funding side per expense: treasury-charged
--    expenses still require account_id (existing behaviour, untouched), partner-charged ones
--    must leave it null (their cost lives entirely in partner_transactions.expense_share rows
--    instead, mirroring how sale_settlement already lives outside treasury_movements).

alter table partner_transactions
  drop constraint if exists partner_transactions_type_check;
alter table partner_transactions
  add constraint partner_transactions_type_check
  check (type in ('funding', 'withdrawal', 'sale_settlement', 'adjustment', 'profit_payout', 'expense_share'));

alter table partner_transactions
  add column if not exists related_expense_id uuid references expenses (id) on delete set null;

alter table treasury_movements
  drop constraint if exists treasury_movements_type_check;
alter table treasury_movements
  add constraint treasury_movements_type_check
  check (type in ('opening', 'sale', 'collection', 'purchase_payment', 'expense', 'return', 'exchange', 'transfer', 'partner_profit_payout'));

alter table expenses
  alter column account_id drop not null;
alter table expenses
  add column if not exists charge_to text not null default 'treasury' check (charge_to in ('treasury', 'partners'));
alter table expenses
  drop constraint if exists expenses_account_or_partners_check;
alter table expenses
  add constraint expenses_account_or_partners_check
  check (
    (charge_to = 'treasury' and account_id is not null) or
    (charge_to = 'partners' and account_id is null)
  );
