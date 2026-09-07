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
 * §14 Customer Module — lean subset for this demo increment. Missing on purpose (real
 * Phase 3 work, not built yet): Documents, Signature, Guarantors (§15), Customer 360
 * (§14 aggregates), Credit Profile (§16), Risk Score (§17). §11 governance: no hard delete —
 * `status` is the only way a customer is retired.
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

/**
 * §19 Product Master — lean subset for this demo increment. `brand`/`model`/`category` are
 * plain text (with a `<datalist>` of previously-used values in the UI as the "simple
 * addable list" §19/§118 asks for, deliberately not a normalized `brands`/
 * `product_categories` table — that promotion is real Supabase-connected work, not worth it
 * over Mock). Missing on purpose: Multiple Units (§23), customer-specific pricing (§25).
 * §20 governance: no hard delete — `active` is the only way a product is retired.
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
