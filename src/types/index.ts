/**
 * Foundation types — spec §118 (Recommended Core Database Entities), Phase 1 subset only
 * (tenants, tenant_settings, users, roles, permissions, role_permissions, user_roles,
 * audit_logs). Later phases add Customers/Products/Sales/Installments/... on top of these
 * without changing this file's shape — see docs/ERP_SaaS_Requirements.md §118 for the full
 * entity list.
 */

export type TenantStatus = "trial" | "active" | "expired" | "suspended";

export interface Tenant {
  id: string;
  name: string;
  owner_name: string;
  phone: string;
  contact_email?: string;
  status: TenantStatus;
  plan_id: string;
  subscription_start: string;
  subscription_end: string;
  created_at: string;
}

/**
 * §113 — Configuration. Fields below are the ones the approved implementation plan commits
 * to needing in Phases 2-7; each is read by name from the phase that introduces it (Phase 2:
 * costing_method §27; Phase 3: employee_discount_limit_pct §18; Phase 4: min_down_payment_pct
 * §39, grace_period_days §41, credit_hold_days §49, late_fee_enabled §50; Phase 7:
 * return_period_days §81). Adding them now avoids touching this type on every later phase.
 */
export interface TenantSettings {
  tenant_id: string;
  currency: string;
  timezone: string;
  costing_method: "average" | "last_purchase" | "fifo";
  employee_discount_limit_pct: number;
  min_down_payment_pct: number;
  grace_period_days: number;
  credit_hold_days: number;
  /** §50 — optional feature; no late fee is ever applied while this is false. */
  late_fee_enabled: boolean;
  return_period_days: number;
  /** §73 — expenses above this amount are flagged `needs_approval` for visibility; a real
   * Approval Engine (§105) that blocks them outright is deferred, same as every other override
   * in this project. */
  expense_approval_threshold: number;
  /** §92/§93 — Notification Center is internal-only (derived, read from `/notifications`); this
   * flag exists purely as an architecture placeholder for a real WhatsApp/SMS provider and stays
   * off — no message is ever actually sent while it's false, nor is any sending code wired up
   * yet even when true. */
  whatsapp_notifications_enabled: boolean;
}

/** §9 — the 8 baseline roles named in the spec; tenants may add more (`is_system: false`). */
export type SystemRoleName =
  | "owner"
  | "manager"
  | "sales"
  | "cashier"
  | "warehouse"
  | "purchasing"
  | "collections"
  | "accountant";

export interface Role {
  id: string;
  tenant_id: string;
  name: string;
  is_system: boolean;
}

/** §10 — granular, independent permissions (not role-level only). Key is a stable slug. */
export interface Permission {
  id: string;
  key: string;
  label_ar: string;
}

export interface RolePermission {
  role_id: string;
  permission_id: string;
}

export interface User {
  id: string;
  tenant_id: string;
  full_name: string;
  email: string;
  /** Mock-mode only — real auth is Supabase Auth (§8), never a plaintext field once connected. */
  password?: string;
  active: boolean;
  created_at: string;
  /** Phase 9 — marks the platform-operator account (tenant_id = the reserved "platform" tenant).
   * Not a `role`; this is orthogonal to the tenant's own role system. */
  is_platform_owner?: boolean;
}

export interface UserRoleAssignment {
  user_id: string;
  role_id: string;
}

/**
 * §12 — immutable via the normal app API (no update/delete function is exposed for this
 * collection). Every sensitive mutation across every phase must call `recordAudit`.
 */
export interface AuditLogEntry {
  id: string;
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string;
  created_at: string;
}

/**
 * §14 Customer Module — lean subset for this demo increment. Missing on purpose: Documents,
 * Signature, full Customer 360 aggregates (a simplified version — purchase history + totals —
 * is Phase 3's `/customers/$id`), Risk Score (§17, real Phase 4 work). §11 governance: no hard
 * delete — `status` is the only way a customer is retired.
 */
export interface Customer {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string;
  alt_phone?: string;
  address?: string;
  notes?: string;
  /** §16 Credit Profile — used by Phase 4's Credit Check (`Available Credit = credit_limit -
   * current exposure`). 0 = no installment credit extended yet. */
  credit_limit: number;
  status: "active" | "inactive";
  created_at: string;
}

/** §15 Guarantors — no hard delete (§11); a guarantor added by mistake is simply not used on
 * any contract, nothing more is needed at this scale. */
export interface Guarantor {
  id: string;
  tenant_id: string;
  customer_id: string;
  name: string;
  phone: string;
  relationship?: string;
  created_at: string;
}

/** §19/§118 "simple addable list": Owner-managed collections behind the brand/category
 * `<datalist>` in the Products form — real rows (addable from the form itself, deactivatable
 * from /settings), not scraped from whatever past products happened to use. `Product.brand`/
 * `Product.category` deliberately stay plain strings rather than becoming foreign keys — a
 * fully normalized relation is real Supabase-connected work, not worth it over Mock; the UI
 * auto-registers any newly typed value here so it's offered again next time. §20 governance:
 * no hard delete, `active` only. */
export interface ProductCategory {
  id: string;
  tenant_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

export interface ProductBrand {
  id: string;
  tenant_id: string;
  name: string;
  active: boolean;
  created_at: string;
}

/**
 * §19 Product Master — lean subset for this demo increment. `model` stays plain text (makes
 * and models vary too much to gain from a managed list the way brand/category do, see
 * `ProductCategory`/`ProductBrand` above). Missing on purpose: Multiple Units (§23),
 * customer-specific pricing (§25). §20 governance: no hard delete — `active` is the only way
 * a product is retired.
 *
 * Serial Number Management (§21) and Inventory Ledger (§29) are real as of Phase 2 — see
 * `ProductSerial` and `InventoryMovement` below, and `receiveStock`/`getProductStock` in
 * data-store.ts.
 */
export interface Product {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  brand?: string;
  model?: string;
  category?: string;
  unit: string;
  cost_price: number;
  cash_price: number;
  installment_price: number;
  min_stock: number;
  max_stock: number;
  warranty_months?: number;
  serial_required: boolean;
  active: boolean;
  created_at: string;
}

/** §21 Serial Number lifecycle. `customer_id`/`sale_id` are added by Phase 3 (sale) and
 * Phase 7 (return) without changing this shape — Omit-based mutation signatures already
 * tolerate that. */
export type SerialStatus = "available" | "sold" | "returned" | "inspection" | "damaged";

export interface ProductSerial {
  id: string;
  tenant_id: string;
  product_id: string;
  serial_number: string;
  status: SerialStatus;
  created_at: string;
}

/**
 * §29 Inventory Ledger — every quantity change is a Movement; a product's stock is always
 * derived by summing these, never a number that moves on its own. `type` values line up with
 * the operations that will produce them: `receipt` (this phase's manual stock-in, later
 * Phase 5 Goods Receipt), `sale` (Phase 3), `return` (Phase 7), `adjustment` (Stock Count,
 * this phase).
 */
export interface InventoryMovement {
  id: string;
  tenant_id: string;
  product_id: string;
  type: "receipt" | "sale" | "return" | "adjustment";
  /** Signed — positive increases stock, negative decreases it. */
  quantity: number;
  before: number;
  after: number;
  user_id: string | null;
  reference?: string;
  reason?: string;
  created_at: string;
}

/**
 * §32/§34 Cash Sale — lean subset. A deliberate simplification for this Mock stage: line
 * items live nested inside the Sale document rather than a separate `sale_items` table
 * (§118 lists one) — real Phase-with-Supabase work can normalize this without changing any
 * call site, since every reader goes through `getSales()`. `serial_id`/`serial_number` are
 * only set for `serial_required` products (one unit per line — a serialized line can't have
 * quantity > 1, matching how §21 tracks each physical unit individually).
 *
 * Missing on purpose: §33's full state machine (this Mock only reaches `completed` directly
 * for cash sales — Draft/Pending Approval/Delivered stages arrive with Phase 7's
 * Delivery/Installation and a real Approval Engine, §105), discount overrides beyond the
 * employee limit (also §105 — deferred rather than faked as a dead-end "pending" state).
 */
export interface SaleItem {
  product_id: string;
  product_name: string;
  serial_id?: string;
  serial_number?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface Sale {
  id: string;
  tenant_id: string;
  invoice_number: string;
  customer_id: string | null;
  customer_name: string;
  items: SaleItem[];
  subtotal: number;
  discount_pct: number;
  discount_amount: number;
  total: number;
  user_id: string | null;
  status: "completed" | "cancelled";
  created_at: string;
}

/**
 * §38 Installment Plans — Owner-managed. §114 Historical Snapshot rule: a plan's
 * `rate_pct`/`duration_months` get copied into every contract that uses them at creation
 * time (`InstallmentContract.plan_rate_pct`/`plan_duration_months`) — editing or deactivating
 * a plan here must never change an existing contract. §11 governance: no hard delete, `active`
 * only.
 */
export interface InstallmentPlan {
  id: string;
  tenant_id: string;
  duration_months: number;
  rate_pct: number;
  active: boolean;
  created_at: string;
}

/** §44 Installment state machine. */
export type InstallmentStatus =
  "scheduled" | "due" | "partially_paid" | "paid" | "overdue" | "waived" | "rescheduled";

export interface Installment {
  id: string;
  tenant_id: string;
  contract_id: string;
  seq: number;
  due_date: string;
  amount: number;
  paid_amount: number;
  status: InstallmentStatus;
  created_at: string;
}

/**
 * §35/§42 Installment Contract — lean subset. `items` nested for the same reason as `Sale`
 * (see its comment). Pricing uses `Product.installment_price`, not `cash_price` (§25 keeps
 * these separate on purpose). §37 finance formula, computed once and frozen here:
 *
 *   principal        = cash_subtotal - down_payment      (the financed base)
 *   finance_amount    = principal × plan_rate_pct / 100    (once, not compounded)
 *   total_amount      = principal + finance_amount         (what the schedule totals)
 *
 * §43 state machine is simplified for this Mock stage: contracts go straight to `active`
 * (no Draft/Pending Approval — that needs a real Approval Engine, §105, not built yet).
 */
export interface InstallmentContract {
  id: string;
  tenant_id: string;
  contract_number: string;
  customer_id: string;
  customer_name: string;
  items: SaleItem[];
  cash_subtotal: number;
  down_payment: number;
  principal: number;
  plan_id: string;
  /** Snapshots of the plan at creation time — §114, never re-read from the live plan. */
  plan_duration_months: number;
  plan_rate_pct: number;
  finance_amount: number;
  total_amount: number;
  installment_amount: number;
  status: "active" | "partially_paid" | "overdue" | "restructured" | "settled" | "settled_early";
  user_id: string | null;
  created_at: string;
}

/**
 * §54/§55 Collection Receipt — one payment can cover more than one installment (§46 Oldest
 * Due First is the default allocation), so `allocations` records exactly how this receipt's
 * amount was split. `receipt_number` is sequential/unique/immutable per §55 — no function
 * exposes a way to edit or delete one, matching "Employee cannot edit, cannot be deleted."
 */
export interface InstallmentPayment {
  id: string;
  tenant_id: string;
  contract_id: string;
  receipt_number: string;
  amount: number;
  allocations: Array<{ installment_id: string; amount: number }>;
  user_id: string | null;
  created_at: string;
}

/** §51 Promise to Pay. `status` starts `pending`; becomes `kept` if a payment lands on/before
 * `promise_date`, or `failed` if the date passes unpaid — Collections Workbench (§52)
 * surfaces failed promises. */
export interface PromiseToPay {
  id: string;
  tenant_id: string;
  contract_id: string;
  promise_date: string;
  expected_amount: number;
  notes?: string;
  user_id: string | null;
  status: "pending" | "kept" | "failed";
  created_at: string;
}

/**
 * §48 Restructuring — never mutates or deletes the original schedule. Its outstanding
 * installments get `status: "rescheduled"` (kept, immutable history) and new `Installment`
 * rows are appended to the same contract for the remaining balance over the new term. This
 * record is the audit trail linking old → new.
 */
export interface RestructureEvent {
  id: string;
  tenant_id: string;
  contract_id: string;
  old_installment_ids: string[];
  remaining_amount: number;
  new_duration_months: number;
  reason: string;
  user_id: string | null;
  created_at: string;
}

/** §60 Suppliers — lean subset. §11 governance: no hard delete — `active` is the only way a
 * supplier is retired. */
export interface Supplier {
  id: string;
  tenant_id: string;
  code: string;
  name: string;
  phone: string;
  address?: string;
  notes?: string;
  active: boolean;
  created_at: string;
}

/**
 * §61-§64 Purchasing — a request and its goods receipt are combined into one action for this
 * Mock stage (`createPurchase` in data-store.ts calls the same `receiveStock` a manual
 * "receive stock" click already uses, not a parallel path). Real Phase-with-Supabase work can
 * split Request → Approval → PO → Receipt into separate states without changing this type's
 * readers, same rule as every other simplified type in this file. `serial_numbers` mirrors
 * exactly what was entered for `serial_required` products (one per unit); empty otherwise.
 */
export interface PurchaseItem {
  product_id: string;
  product_name: string;
  serial_numbers: string[];
  quantity: number;
  unit_cost: number;
  line_total: number;
}

export interface Purchase {
  id: string;
  tenant_id: string;
  purchase_number: string;
  supplier_id: string;
  supplier_name: string;
  items: PurchaseItem[];
  total: number;
  user_id: string | null;
  created_at: string;
}

/** §65 Supplier Payments — unlike customer installments, suppliers have no due-date schedule in
 * this Mock: a payment simply reduces the running balance
 * (`sum(purchases.total) - sum(payments.amount)` for that supplier), validated against it in
 * `recordSupplierPayment` before writing. */
export interface SupplierPayment {
  id: string;
  tenant_id: string;
  supplier_id: string;
  amount: number;
  user_id: string | null;
  created_at: string;
}

/**
 * §68 Treasury — multiple accounts (main + at least one cashier float). A balance is never
 * stored on the account itself; it's always the sum of that account's `TreasuryMovement` rows
 * (`getAccountBalance` in data-store.ts), same principle §29's Inventory Ledger uses for stock.
 * §11 governance: no hard delete — `active` only.
 */
export interface TreasuryAccount {
  id: string;
  tenant_id: string;
  name: string;
  kind: "main" | "cashier" | "bank" | "wallet";
  active: boolean;
  created_at: string;
}

export interface TreasuryMovement {
  id: string;
  tenant_id: string;
  account_id: string;
  type: "opening" | "sale" | "collection" | "purchase_payment" | "expense" | "return" | "exchange";
  /** Signed — positive increases the account's balance, negative decreases it. */
  amount: number;
  before: number;
  after: number;
  user_id: string | null;
  reference?: string;
  reason?: string;
  created_at: string;
}

/**
 * §70 Shift management — an opening float count and a closing float count on the same cashier
 * account; the gap between what the ledger *expects* (`opening_balance` + every movement since
 * `opened_at`) and what was actually counted must carry a reason whenever it isn't zero.
 */
export interface Shift {
  id: string;
  tenant_id: string;
  account_id: string;
  opening_balance: number;
  opened_by: string | null;
  opened_at: string;
  status: "open" | "closed";
  closing_counted_amount?: number;
  closing_expected_amount?: number;
  closing_diff?: number;
  closing_reason?: string;
  closed_by?: string | null;
  closed_at?: string;
}

/** §73 Expenses — §11 governance: no hard delete, no edit either (a mistaken expense is a new
 * corrective entry, not a rewrite of history) — `recordExpense` is the only mutation exposed. */
export interface Expense {
  id: string;
  tenant_id: string;
  account_id: string;
  category: string;
  amount: number;
  reason: string;
  needs_approval: boolean;
  user_id: string | null;
  created_at: string;
  /** Real (if minimal) resolution for `needs_approval` — the money already left the account
   * when the expense was recorded (§105 blocking approval is still deferred), but this closes
   * the loop so a flagged expense is actually acted on instead of staying flagged forever. */
  approved_by?: string | null;
  approved_at?: string;
  approval_note?: string;
}

/**
 * §74/§75 simplified Chart of Accounts + auto Journal Entries. An employee never enters one of
 * these by hand — every business action that moves money (`createSale`, `createInstallmentContract`,
 * `collectPayment`, `createPurchase`, `recordSupplierPayment`, `recordExpense`) posts one behind
 * the scenes via `postJournalEntry`, so `/accounting` has something real to show without anyone
 * touching debits/credits directly. Product-Profit vs Financing-Revenue separation (§75) is why
 * `3100` exists apart from `3000`.
 */
export type AccountCode = "1000" | "1100" | "1200" | "2000" | "3000" | "3100" | "5000";

export interface JournalLine {
  account_code: AccountCode;
  account_name: string;
  debit: number;
  credit: number;
}

export interface JournalEntry {
  id: string;
  tenant_id: string;
  entry_number: string;
  lines: JournalLine[];
  description: string;
  reference_type: string;
  reference_id: string;
  created_at: string;
}

/**
 * §79/§81 Returns — scoped to cash sales only in this Mock increment (an installment-contract
 * return would need to unwind AR/schedule math, real Phase-with-Supabase work; the spec doesn't
 * require it in V1 either). §11 governance: the original `Sale` is never edited or deleted —
 * a `SaleReturn` is a new, separate record referencing it. A returned `serial_required` unit
 * goes to `inspection`, never straight back to `available` (§81) — it only becomes sellable
 * again through a manual product-detail action, not through this flow.
 */
export interface ReturnItem {
  product_id: string;
  product_name: string;
  serial_id?: string;
  serial_number?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

export interface SaleReturn {
  id: string;
  tenant_id: string;
  return_number: string;
  sale_id: string;
  customer_id: string | null;
  customer_name: string;
  items: ReturnItem[];
  refund_amount: number;
  reason: string;
  user_id: string | null;
  created_at: string;
}

/**
 * §82 Exchange — a simplified compound action: return some items (same Inspection rule as
 * `SaleReturn`) and sell new ones in the same transaction, settling only the price difference
 * (paid in cash if positive, refunded in cash if negative) rather than two separate documents.
 */
export interface ExchangeTransaction {
  id: string;
  tenant_id: string;
  exchange_number: string;
  original_sale_id: string;
  returned_items: ReturnItem[];
  new_items: SaleItem[];
  /** new_items total − returned_items total. Positive = customer paid more; negative = refunded. */
  price_difference: number;
  reason: string;
  user_id: string | null;
  created_at: string;
}

/**
 * §84 Delivery Orders — a service tracked separately from the sale's value (§133 rule 11: never
 * folded into Principal automatically). §11 governance: no hard delete — the state machine
 * (`scheduled` → `out_for_delivery` → `delivered`) is the only way a delivery moves forward.
 */
export interface DeliveryOrder {
  id: string;
  tenant_id: string;
  sale_id: string;
  customer_name: string;
  address: string;
  scheduled_date: string;
  status: "scheduled" | "out_for_delivery" | "delivered";
  delivered_at?: string;
  user_id: string | null;
  created_at: string;
}
