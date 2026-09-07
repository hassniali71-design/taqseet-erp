-- §68-§75 Finance — Treasury accounts + movement ledger, Shifts, Expenses, and a simplified
-- Chart of Accounts with auto-generated Journal Entries. Not yet applied to any Supabase
-- project (Phase 0-6 use a local Mock data-store — see CLAUDE.md). Mirrors
-- src/types/index.ts's TreasuryAccount/TreasuryMovement/Shift/Expense/JournalEntry exactly,
-- same drop-in-swap rule as every earlier migration in this folder.
--
-- §11 governance: no hard delete anywhere here. `treasury_accounts` uses `active`;
-- `treasury_movements`/`journal_entries` are append-only ledgers (no update/delete policy,
-- same rule as `inventory_movements` and `audit_logs`); `shifts` moves through its own two-step
-- state machine (open → closed) via `closeShift`, never deleted; `expenses` has no edit or
-- delete function exposed at all — a mistaken expense is a new corrective entry, not a rewrite
-- of history.

create table if not exists treasury_accounts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  name text not null,
  kind text not null check (kind in ('main', 'cashier', 'bank', 'wallet')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_accounts_tenant on treasury_accounts (tenant_id);

-- §68 — an account's balance is never stored; it's always the sum of its movements
-- (getAccountBalance in data-store.ts), same principle as inventory_movements/product stock.
create table if not exists treasury_movements (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  account_id uuid not null references treasury_accounts (id) on delete restrict,
  type text not null check (type in ('opening', 'sale', 'collection', 'purchase_payment', 'expense')),
  amount numeric(12, 2) not null,
  before numeric(12, 2) not null,
  after numeric(12, 2) not null,
  user_id uuid references users (id) on delete set null,
  reference text,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_treasury_movements_tenant on treasury_movements (tenant_id);
create index if not exists idx_treasury_movements_account on treasury_movements (account_id, created_at);

-- §70 Shift management — expected balance at close time is computed from opening_balance plus
-- every movement on the account since opened_at (never trusted as a carried-forward number);
-- closing_reason is required by application logic whenever closing_diff isn't zero.
create table if not exists shifts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  account_id uuid not null references treasury_accounts (id) on delete restrict,
  opening_balance numeric(12, 2) not null,
  opened_by uuid references users (id) on delete set null,
  opened_at timestamptz not null default now(),
  status text not null default 'open' check (status in ('open', 'closed')),
  closing_counted_amount numeric(12, 2),
  closing_expected_amount numeric(12, 2),
  closing_diff numeric(12, 2),
  closing_reason text,
  closed_by uuid references users (id) on delete set null,
  closed_at timestamptz
);

create index if not exists idx_shifts_tenant on shifts (tenant_id);
create index if not exists idx_shifts_account_status on shifts (account_id, status);

-- §73 — amounts above tenant_settings.expense_approval_threshold are flagged needs_approval for
-- visibility only; a real Approval Engine (§105) that blocks them outright is deferred, same
-- decision already made for sale discounts and installment credit overrides.
create table if not exists expenses (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  account_id uuid not null references treasury_accounts (id) on delete restrict,
  category text not null,
  amount numeric(12, 2) not null,
  reason text not null,
  needs_approval boolean not null default false,
  user_id uuid references users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_expenses_tenant on expenses (tenant_id);

-- §74/§75 simplified Chart of Accounts + Journal Entries. An employee never enters one of these
-- by hand — every business action that moves money posts one via postJournalEntry in
-- data-store.ts, which double-checks debits equal credits before writing. `lines` is jsonb for
-- the same reason as sales.items (0004) — a deliberate Mock-stage simplification.
create table if not exists journal_entries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants (id) on delete cascade,
  entry_number text not null,
  lines jsonb not null,
  description text not null,
  reference_type text not null,
  reference_id text not null,
  created_at timestamptz not null default now(),
  unique (tenant_id, entry_number)
);

create index if not exists idx_journal_entries_tenant on journal_entries (tenant_id);
create index if not exists idx_journal_entries_reference on journal_entries (reference_type, reference_id);

alter table treasury_accounts enable row level security;
create policy treasury_accounts_isolation on treasury_accounts
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table treasury_movements enable row level security;
create policy treasury_movements_select on treasury_movements
  for select
  using (tenant_id = current_tenant_id());
create policy treasury_movements_insert on treasury_movements
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — append-only ledger, same rule as inventory_movements.

alter table shifts enable row level security;
create policy shifts_isolation on shifts
  for all
  using (tenant_id = current_tenant_id())
  with check (tenant_id = current_tenant_id());

alter table expenses enable row level security;
create policy expenses_select on expenses
  for select
  using (tenant_id = current_tenant_id());
create policy expenses_insert on expenses
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — a mistaken expense gets a corrective entry, not a
-- rewrite of history.

alter table journal_entries enable row level security;
create policy journal_entries_select on journal_entries
  for select
  using (tenant_id = current_tenant_id());
create policy journal_entries_insert on journal_entries
  for insert
  with check (tenant_id = current_tenant_id());
-- Deliberately no update/delete policy — same immutable-ledger rule as treasury_movements.
