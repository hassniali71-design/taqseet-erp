import type {
  AccountCode,
  AuditLogEntry,
  Customer,
  DeliveryOrder,
  Expense,
  ExchangeTransaction,
  Guarantor,
  Installment,
  InstallmentContract,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentStatus,
  InventoryMovement,
  JournalEntry,
  JournalLine,
  Permission,
  PromiseToPay,
  Product,
  ProductSerial,
  Purchase,
  PurchaseItem,
  RestructureEvent,
  ReturnItem,
  Role,
  RolePermission,
  Sale,
  SaleItem,
  SaleReturn,
  Shift,
  Supplier,
  SupplierPayment,
  SystemRoleName,
  Tenant,
  TenantSettings,
  TreasuryAccount,
  TreasuryMovement,
  User,
  UserRoleAssignment,
} from "@/types";
import { calculateFinance, generateSchedule } from "@/lib/finance-engine";

/**
 * Foundation Mock data layer — Phase 0.
 *
 * Same localStorage + subscribe/emit pattern used throughout this project (do not invent a
 * parallel pattern — see CLAUDE.md). Every collection below mirrors a real table name from
 * docs/ERP_SaaS_Requirements.md §118 so that connecting real Supabase later is a drop-in
 * replacement of these functions' bodies, not a redesign of their call sites.
 *
 * ⚠️ This is temporary scaffolding, not a security boundary: there is no RLS, no server-side
 * authorization, and no real Auth here yet. §133's non-negotiable rules (tenant isolation,
 * RLS mandatory, server-side authorization mandatory) are NOT satisfied until this is replaced
 * by real Supabase-backed server functions in Phase 1.
 */

const STORAGE_PREFIX = "taqseet";

const KEYS = {
  tenants: `${STORAGE_PREFIX}.tenants.v1`,
  tenantSettings: `${STORAGE_PREFIX}.tenant_settings.v1`,
  users: `${STORAGE_PREFIX}.users.v1`,
  roles: `${STORAGE_PREFIX}.roles.v1`,
  permissions: `${STORAGE_PREFIX}.permissions.v1`,
  rolePermissions: `${STORAGE_PREFIX}.role_permissions.v1`,
  userRoles: `${STORAGE_PREFIX}.user_roles.v1`,
  auditLogs: `${STORAGE_PREFIX}.audit_logs.v1`,
  session: `${STORAGE_PREFIX}.session.v1`,
  customers: `${STORAGE_PREFIX}.customers.v1`,
  products: `${STORAGE_PREFIX}.products.v1`,
  productSerials: `${STORAGE_PREFIX}.product_serials.v1`,
  inventoryMovements: `${STORAGE_PREFIX}.inventory_movements.v1`,
  guarantors: `${STORAGE_PREFIX}.guarantors.v1`,
  sales: `${STORAGE_PREFIX}.sales.v1`,
  installmentPlans: `${STORAGE_PREFIX}.installment_plans.v1`,
  installmentContracts: `${STORAGE_PREFIX}.installment_contracts.v1`,
  installments: `${STORAGE_PREFIX}.installments.v1`,
  installmentPayments: `${STORAGE_PREFIX}.installment_payments.v1`,
  promisesToPay: `${STORAGE_PREFIX}.promises_to_pay.v1`,
  restructureEvents: `${STORAGE_PREFIX}.restructure_events.v1`,
  suppliers: `${STORAGE_PREFIX}.suppliers.v1`,
  purchases: `${STORAGE_PREFIX}.purchases.v1`,
  supplierPayments: `${STORAGE_PREFIX}.supplier_payments.v1`,
  treasuryAccounts: `${STORAGE_PREFIX}.treasury_accounts.v1`,
  treasuryMovements: `${STORAGE_PREFIX}.treasury_movements.v1`,
  shifts: `${STORAGE_PREFIX}.shifts.v1`,
  expenses: `${STORAGE_PREFIX}.expenses.v1`,
  journalEntries: `${STORAGE_PREFIX}.journal_entries.v1`,
  saleReturns: `${STORAGE_PREFIX}.sale_returns.v1`,
  exchangeTransactions: `${STORAGE_PREFIX}.exchange_transactions.v1`,
  deliveryOrders: `${STORAGE_PREFIX}.delivery_orders.v1`,
} as const;

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((listener) => listener());
}

export function subscribeData(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function readCollection<T>(key: string, seed: () => T[]): T[] {
  if (typeof window === "undefined") return seed();
  const raw = window.localStorage.getItem(key);
  if (raw) {
    try {
      return JSON.parse(raw) as T[];
    } catch {
      /* fall through to seed */
    }
  }
  const seeded = seed();
  window.localStorage.setItem(key, JSON.stringify(seeded));
  return seeded;
}

function writeCollection<T>(key: string, rows: T[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(key, JSON.stringify(rows));
  emit();
}

function genId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
}

/* ---------------- Seed (first run only — never re-seeds once a key exists) ---------------- */

const DEMO_TENANT_ID = "tenant_demo";

function seedTenants(): Tenant[] {
  const now = new Date().toISOString();
  return [
    {
      id: DEMO_TENANT_ID,
      name: "محل تجريبي",
      owner_name: "مالك المحل",
      phone: "01000000000",
      status: "trial",
      plan_id: "plan_trial",
      subscription_start: now,
      subscription_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      created_at: now,
    },
  ];
}

function seedTenantSettings(): TenantSettings[] {
  return [
    {
      tenant_id: DEMO_TENANT_ID,
      currency: "EGP",
      timezone: "Africa/Cairo",
      costing_method: "average",
      employee_discount_limit_pct: 5,
      min_down_payment_pct: 10,
      grace_period_days: 3,
      credit_hold_days: 7,
      late_fee_enabled: false,
      return_period_days: 14,
      expense_approval_threshold: 2000,
      whatsapp_notifications_enabled: false,
    },
  ];
}

/** §9 — the 8 baseline system roles. */
const SYSTEM_ROLE_NAMES: SystemRoleName[] = [
  "owner",
  "manager",
  "sales",
  "cashier",
  "warehouse",
  "purchasing",
  "collections",
  "accountant",
];

function seedRoles(): Role[] {
  return SYSTEM_ROLE_NAMES.map((name) => ({
    id: `role_${name}`,
    tenant_id: DEMO_TENANT_ID,
    name,
    is_system: true,
  }));
}

/** §10 — a starter subset; more permission keys are added as each phase's mutations land. */
const PERMISSION_SEED: Array<{ key: string; label_ar: string }> = [
  { key: "sale.create", label_ar: "إنشاء بيع" },
  { key: "sale.cancel", label_ar: "إلغاء بيع" },
  { key: "sale.discount.apply", label_ar: "تطبيق خصم" },
  { key: "sale.price.edit", label_ar: "تعديل سعر" },
  { key: "installment.create", label_ar: "إنشاء تقسيط" },
  { key: "installment.approve", label_ar: "اعتماد تقسيط" },
  { key: "collection.collect", label_ar: "تحصيل دفعة" },
  { key: "collection.reverse", label_ar: "عكس تحصيل" },
  { key: "return.create", label_ar: "إنشاء مرتجع" },
  { key: "return.approve", label_ar: "اعتماد مرتجع" },
  { key: "exchange.create", label_ar: "إنشاء استبدال" },
  { key: "installment.edit", label_ar: "تعديل تقسيط" },
  { key: "contract.restructure", label_ar: "إعادة هيكلة عقد" },
  { key: "contract.settle_early", label_ar: "تسوية مبكرة" },
  { key: "customer.balance.adjust", label_ar: "تعديل رصيد عميل" },
  { key: "inventory.adjust", label_ar: "تعديل مخزون" },
  { key: "expense.approve", label_ar: "اعتماد مصروف" },
  { key: "shift.close", label_ar: "إقفال وردية" },
  { key: "day.close", label_ar: "إقفال يوم" },
  { key: "month.close", label_ar: "إقفال شهر" },
  { key: "credit_limit.override", label_ar: "تجاوز حد ائتمان" },
  { key: "discount.override", label_ar: "تجاوز حد خصم" },
  { key: "support_access.use", label_ar: "دخول دعم فني (Impersonation)" },
];

function seedPermissions(): Permission[] {
  return PERMISSION_SEED.map((p) => ({ id: `perm_${p.key}`, key: p.key, label_ar: p.label_ar }));
}

/** Phase 0: Owner role gets every permission; other roles get none yet — assigned per-phase as each capability ships. */
function seedRolePermissions(): RolePermission[] {
  return PERMISSION_SEED.map((p) => ({ role_id: "role_owner", permission_id: `perm_${p.key}` }));
}

function seedUsers(): User[] {
  return [
    {
      id: "user_demo_owner",
      tenant_id: DEMO_TENANT_ID,
      full_name: "مالك المحل",
      email: "owner@demo.local",
      password: "owner123",
      active: true,
      created_at: new Date().toISOString(),
    },
  ];
}

function seedUserRoles(): UserRoleAssignment[] {
  return [{ user_id: "user_demo_owner", role_id: "role_owner" }];
}

/** §14 — a couple of demo rows so the Customers page isn't empty on first run. */
function seedCustomers(): Customer[] {
  const now = new Date().toISOString();
  return [
    {
      id: "cust_demo_1",
      tenant_id: DEMO_TENANT_ID,
      code: "CUST-0001",
      name: "أحمد محمود",
      phone: "01012345678",
      address: "القاهرة",
      credit_limit: 30000,
      status: "active",
      created_at: now,
    },
    {
      id: "cust_demo_2",
      tenant_id: DEMO_TENANT_ID,
      code: "CUST-0002",
      name: "منى سعيد",
      phone: "01098765432",
      address: "الجيزة",
      credit_limit: 20000,
      status: "active",
      created_at: now,
    },
  ];
}

/** §19 — a couple of demo appliances so the Products page isn't empty on first run. */
function seedProducts(): Product[] {
  const now = new Date().toISOString();
  return [
    {
      id: "prod_demo_1",
      tenant_id: DEMO_TENANT_ID,
      code: "PRD-0001",
      name: "ثلاجة توشيبا 16 قدم",
      brand: "Toshiba",
      model: "GR-EF37",
      category: "ثلاجات",
      unit: "قطعة",
      cost_price: 12000,
      cash_price: 15000,
      installment_price: 16500,
      min_stock: 2,
      max_stock: 20,
      warranty_months: 12,
      serial_required: true,
      active: true,
      created_at: now,
    },
    {
      id: "prod_demo_2",
      tenant_id: DEMO_TENANT_ID,
      code: "PRD-0002",
      name: "غسالة سامسونج 8 كيلو",
      brand: "Samsung",
      model: "WW80",
      category: "غسالات",
      unit: "قطعة",
      cost_price: 9000,
      cash_price: 11500,
      installment_price: 12800,
      min_stock: 3,
      max_stock: 25,
      warranty_months: 24,
      serial_required: true,
      active: true,
      created_at: now,
    },
    {
      id: "prod_demo_3",
      tenant_id: DEMO_TENANT_ID,
      code: "PRD-0003",
      name: "كابل توصيل كهرباء",
      brand: "Generic",
      category: "إكسسوارات",
      unit: "قطعة",
      cost_price: 30,
      cash_price: 50,
      installment_price: 55,
      min_stock: 10,
      max_stock: 200,
      serial_required: false,
      active: true,
      created_at: now,
    },
  ];
}

/** Sequential human-friendly codes (e.g. `CUST-0003`) from the current row count — fine for a
 * single-tenant Mock demo; a real Phase 2/3 numbering scheme (§91) is tenant-wide and
 * server-generated. */
function nextCode(prefix: string, count: number): string {
  return `${prefix}-${String(count + 1).padStart(4, "0")}`;
}

/** §38 — the exact example plans from the spec. */
function seedInstallmentPlans(): InstallmentPlan[] {
  const now = new Date().toISOString();
  return [
    { duration_months: 3, rate_pct: 10 },
    { duration_months: 6, rate_pct: 20 },
    { duration_months: 9, rate_pct: 30 },
    { duration_months: 12, rate_pct: 40 },
  ].map((p, i) => ({
    id: `plan_demo_${i + 1}`,
    tenant_id: DEMO_TENANT_ID,
    duration_months: p.duration_months,
    rate_pct: p.rate_pct,
    active: true,
    created_at: now,
  }));
}

/** Seeds a few `available` serials per demo product, plus the matching receipt movements, so
 * the Products/inventory screens aren't empty on first run — mirrors what `receiveStock`
 * would produce for a real goods receipt. */
function seedProductSerials(): ProductSerial[] {
  const now = new Date().toISOString();
  const serials: ProductSerial[] = [];
  const demoSerials: Record<string, string[]> = {
    prod_demo_1: ["TSH-0001", "TSH-0002", "TSH-0003"],
    prod_demo_2: ["SAM-0001", "SAM-0002", "SAM-0003", "SAM-0004", "SAM-0005"],
  };
  for (const [productId, numbers] of Object.entries(demoSerials)) {
    for (const serial_number of numbers) {
      serials.push({
        id: genId("serial"),
        tenant_id: DEMO_TENANT_ID,
        product_id: productId,
        serial_number,
        status: "available",
        created_at: now,
      });
    }
  }
  return serials;
}

function seedInventoryMovements(): InventoryMovement[] {
  const now = new Date().toISOString();
  return [
    {
      id: genId("mov"),
      tenant_id: DEMO_TENANT_ID,
      product_id: "prod_demo_1",
      type: "receipt",
      quantity: 3,
      before: 0,
      after: 3,
      user_id: null,
      reference: "Seed",
      reason: "رصيد افتتاحي تجريبي",
      created_at: now,
    },
    {
      id: genId("mov"),
      tenant_id: DEMO_TENANT_ID,
      product_id: "prod_demo_2",
      type: "receipt",
      quantity: 5,
      before: 0,
      after: 5,
      user_id: null,
      reference: "Seed",
      reason: "رصيد افتتاحي تجريبي",
      created_at: now,
    },
    {
      id: genId("mov"),
      tenant_id: DEMO_TENANT_ID,
      product_id: "prod_demo_3",
      type: "receipt",
      quantity: 40,
      before: 0,
      after: 40,
      user_id: null,
      reference: "Seed",
      reason: "رصيد افتتاحي تجريبي",
      created_at: now,
    },
  ];
}

/** §60 — a couple of demo rows so the Suppliers page isn't empty on first run. */
function seedSuppliers(): Supplier[] {
  const now = new Date().toISOString();
  return [
    {
      id: "supplier_demo_1",
      tenant_id: DEMO_TENANT_ID,
      code: "SUP-0001",
      name: "شركة الدلتا للأجهزة",
      phone: "0223456789",
      address: "القاهرة",
      active: true,
      created_at: now,
    },
    {
      id: "supplier_demo_2",
      tenant_id: DEMO_TENANT_ID,
      code: "SUP-0002",
      name: "مؤسسة النور للتوريدات",
      phone: "0224567891",
      active: true,
      created_at: now,
    },
  ];
}

/** §68 — the two accounts every retailer needs at minimum: a main treasury and one cashier
 * float. Both are used directly by the cash-sale/collection/expense flows below (default target
 * = the cashier account), never left unreachable. */
const MAIN_ACCOUNT_ID = "account_main";
const CASHIER_ACCOUNT_ID = "account_cashier";

function seedTreasuryAccounts(): TreasuryAccount[] {
  const now = new Date().toISOString();
  return [
    {
      id: MAIN_ACCOUNT_ID,
      tenant_id: DEMO_TENANT_ID,
      name: "الخزينة الرئيسية",
      kind: "main",
      active: true,
      created_at: now,
    },
    {
      id: CASHIER_ACCOUNT_ID,
      tenant_id: DEMO_TENANT_ID,
      name: "خزينة الكاشير",
      kind: "cashier",
      active: true,
      created_at: now,
    },
  ];
}

/** An opening deposit for the cashier float — a real movement, not a stored balance field, same
 * principle as `seedInventoryMovements` establishing starting stock. */
function seedTreasuryMovements(): TreasuryMovement[] {
  const now = new Date().toISOString();
  return [
    {
      id: genId("tmov"),
      tenant_id: DEMO_TENANT_ID,
      account_id: CASHIER_ACCOUNT_ID,
      type: "opening",
      amount: 5000,
      before: 0,
      after: 5000,
      user_id: null,
      reference: "Seed",
      reason: "رصيد افتتاحي تجريبي",
      created_at: now,
    },
  ];
}

/* ---------------- Reads ---------------- */

export function getTenants(): Tenant[] {
  return readCollection(KEYS.tenants, seedTenants);
}

export function getTenantSettings(): TenantSettings[] {
  return readCollection(KEYS.tenantSettings, seedTenantSettings);
}

/** Single-tenant Mock convenience — the demo tenant always has exactly one settings row. */
export function getCurrentTenantSettings(): TenantSettings {
  const row = getTenantSettings().find((s) => s.tenant_id === DEMO_TENANT_ID);
  if (!row) throw new Error("Tenant settings غير موجودة");
  return row;
}

export function updateTenantSettings(
  patch: Partial<Omit<TenantSettings, "tenant_id">>,
  actorUserId: string | null,
): void {
  const settings = getTenantSettings();
  const before = getCurrentTenantSettings();
  const after: TenantSettings = { ...before, ...patch };
  writeCollection(
    KEYS.tenantSettings,
    settings.map((s) => (s.tenant_id === DEMO_TENANT_ID ? after : s)),
  );
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "tenant_settings.update",
    entity: "tenant_settings",
    entity_id: DEMO_TENANT_ID,
    old_value: before,
    new_value: after,
  });
}

export function getRoles(): Role[] {
  return readCollection(KEYS.roles, seedRoles);
}

export function getPermissions(): Permission[] {
  return readCollection(KEYS.permissions, seedPermissions);
}

export function getRolePermissions(): RolePermission[] {
  return readCollection(KEYS.rolePermissions, seedRolePermissions);
}

export function getUsers(): User[] {
  return readCollection(KEYS.users, seedUsers);
}

export function getUserRoles(): UserRoleAssignment[] {
  return readCollection(KEYS.userRoles, seedUserRoles);
}

export function getAuditLogs(): AuditLogEntry[] {
  return readCollection(KEYS.auditLogs, () => []);
}

export function getCustomers(): Customer[] {
  return readCollection(KEYS.customers, seedCustomers);
}

export function getProducts(): Product[] {
  return readCollection(KEYS.products, seedProducts);
}

export function getProductSerials(): ProductSerial[] {
  return readCollection(KEYS.productSerials, seedProductSerials);
}

export function getInventoryMovements(): InventoryMovement[] {
  return readCollection(KEYS.inventoryMovements, seedInventoryMovements);
}

export function getGuarantors(): Guarantor[] {
  return readCollection(KEYS.guarantors, () => []);
}

export function getSales(): Sale[] {
  return readCollection(KEYS.sales, () => []);
}

export function getSaleReturns(): SaleReturn[] {
  return readCollection(KEYS.saleReturns, () => []);
}

export function getExchangeTransactions(): ExchangeTransaction[] {
  return readCollection(KEYS.exchangeTransactions, () => []);
}

export function getDeliveryOrders(): DeliveryOrder[] {
  return readCollection(KEYS.deliveryOrders, () => []);
}

export function getSuppliers(): Supplier[] {
  return readCollection(KEYS.suppliers, seedSuppliers);
}

export function getPurchases(): Purchase[] {
  return readCollection(KEYS.purchases, () => []);
}

export function getSupplierPayments(): SupplierPayment[] {
  return readCollection(KEYS.supplierPayments, () => []);
}

/** §65 — running balance owed to a supplier: total purchased minus total paid. No due-date
 * schedule on this side (unlike customer installments), so this is the whole picture. */
export function getSupplierBalance(supplierId: string): number {
  const totalPurchased = getPurchases()
    .filter((p) => p.supplier_id === supplierId)
    .reduce((sum, p) => sum + p.total, 0);
  const totalPaid = getSupplierPayments()
    .filter((p) => p.supplier_id === supplierId)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.round((totalPurchased - totalPaid) * 100) / 100;
}

export function getTreasuryAccounts(): TreasuryAccount[] {
  return readCollection(KEYS.treasuryAccounts, seedTreasuryAccounts);
}

export function getTreasuryMovements(): TreasuryMovement[] {
  return readCollection(KEYS.treasuryMovements, seedTreasuryMovements);
}

export function getShifts(): Shift[] {
  return readCollection(KEYS.shifts, () => []);
}

export function getExpenses(): Expense[] {
  return readCollection(KEYS.expenses, () => []);
}

export function getJournalEntries(): JournalEntry[] {
  return readCollection(KEYS.journalEntries, () => []);
}

/** §68 — the single source of truth for "how much is in this account": sum of every signed
 * movement, never a standalone balance field. Same principle as `getProductStock`. */
export function getAccountBalance(accountId: string): number {
  return (
    Math.round(
      getTreasuryMovements()
        .filter((m) => m.account_id === accountId)
        .reduce((sum, m) => sum + m.amount, 0) * 100,
    ) / 100
  );
}

export function getInstallmentPlans(): InstallmentPlan[] {
  return readCollection(KEYS.installmentPlans, seedInstallmentPlans);
}

export function getInstallmentContracts(): InstallmentContract[] {
  return readCollection(KEYS.installmentContracts, () => []);
}

export function getInstallments(): Installment[] {
  return readCollection(KEYS.installments, () => []);
}

export function getInstallmentPayments(): InstallmentPayment[] {
  return readCollection(KEYS.installmentPayments, () => []);
}

export function getPromisesToPay(): PromiseToPay[] {
  return readCollection(KEYS.promisesToPay, () => []);
}

export function getRestructureEvents(): RestructureEvent[] {
  return readCollection(KEYS.restructureEvents, () => []);
}

/**
 * §17-adjacent helper (full Risk Score is real Phase-with-Supabase work) — the customer's
 * current outstanding balance across every contract that isn't fully settled, used by the
 * Credit Check (§57: `Available Credit = credit_limit - Current Exposure`).
 */
export function getCustomerExposure(customerId: string): number {
  const contracts = getInstallmentContracts().filter(
    (c) => c.customer_id === customerId && c.status !== "settled" && c.status !== "settled_early",
  );
  const installments = getInstallments();
  return contracts.reduce((sum, contract) => {
    const outstanding = installments
      .filter((i) => i.contract_id === contract.id && i.status !== "waived")
      .reduce((s, i) => s + Math.max(0, i.amount - i.paid_amount), 0);
    return sum + outstanding;
  }, 0);
}

/**
 * §49 Overdue — computed on read, never persisted, since "is this late" depends on today's
 * date, not an event. `status` itself only ever gets written by real actions (a payment, a
 * waive, a restructure) — see the state machine note on the `Installment` type.
 */
export function getEffectiveInstallmentStatus(
  installment: Installment,
  gracePeriodDays: number,
): InstallmentStatus {
  if (
    installment.status === "paid" ||
    installment.status === "waived" ||
    installment.status === "rescheduled"
  ) {
    return installment.status;
  }
  const dueWithGrace = new Date(installment.due_date);
  dueWithGrace.setDate(dueWithGrace.getDate() + gracePeriodDays);
  const isPastGrace = new Date() > dueWithGrace;
  if (installment.paid_amount > 0 && installment.paid_amount < installment.amount) {
    return isPastGrace ? "overdue" : "partially_paid";
  }
  if (isPastGrace) return "overdue";
  return new Date() >= new Date(installment.due_date) ? "due" : "scheduled";
}

export function getDaysOverdue(installment: Installment): number {
  const diffMs = Date.now() - new Date(installment.due_date).getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/** §56 Credit Hold — blocks new contracts once a customer has an installment overdue by more
 * than `credit_hold_days`. */
export function isCustomerOnCreditHold(customerId: string, creditHoldDays: number): boolean {
  const contractIds = new Set(
    getInstallmentContracts()
      .filter((c) => c.customer_id === customerId)
      .map((c) => c.id),
  );
  return getInstallments().some(
    (i) =>
      contractIds.has(i.contract_id) &&
      i.status !== "paid" &&
      i.status !== "waived" &&
      getDaysOverdue(i) > creditHoldDays,
  );
}

/**
 * §29 — the single source of truth for "how much of this do we have": serialized products
 * count their `available` serials; non-serialized products sum every movement's signed
 * quantity. Never read/write a standalone stock-quantity field.
 */
export function getProductStock(productId: string, product?: Product): number {
  const isSerialRequired =
    product?.serial_required ?? getProducts().find((p) => p.id === productId)?.serial_required;
  if (isSerialRequired) {
    return getProductSerials().filter((s) => s.product_id === productId && s.status === "available")
      .length;
  }
  return getInventoryMovements()
    .filter((m) => m.product_id === productId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

/** Permission keys currently granted to a user, across all of their assigned roles. */
export function getUserPermissionKeys(userId: string): Set<string> {
  const roleIds = new Set(
    getUserRoles()
      .filter((ur) => ur.user_id === userId)
      .map((ur) => ur.role_id),
  );
  const permissionIds = new Set(
    getRolePermissions()
      .filter((rp) => roleIds.has(rp.role_id))
      .map((rp) => rp.permission_id),
  );
  return new Set(
    getPermissions()
      .filter((p) => permissionIds.has(p.id))
      .map((p) => p.key),
  );
}

/* ---------------- Audit (§12 — every sensitive mutation across every phase must call this) ---------------- */

export function recordAudit(entry: {
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string;
}): void {
  const row: AuditLogEntry = {
    id: genId("audit"),
    created_at: new Date().toISOString(),
    ...entry,
  };
  writeCollection(KEYS.auditLogs, [...getAuditLogs(), row]);
}

/* ---------------- Mutations (Phase 0 — tenant/user/role administration only) ---------------- */

export function createTenant(input: Omit<Tenant, "id" | "created_at">): Tenant {
  const tenant: Tenant = { ...input, id: genId("tenant"), created_at: new Date().toISOString() };
  writeCollection(KEYS.tenants, [...getTenants(), tenant]);
  recordAudit({
    tenant_id: tenant.id,
    user_id: null,
    action: "tenant.create",
    entity: "tenants",
    entity_id: tenant.id,
    new_value: tenant,
  });
  return tenant;
}

export function setTenantStatus(
  tenantId: string,
  status: Tenant["status"],
  actorUserId: string | null,
  reason: string,
): void {
  const tenants = getTenants();
  const before = tenants.find((t) => t.id === tenantId);
  if (!before) throw new Error("Tenant غير موجود");
  const after = { ...before, status };
  writeCollection(
    KEYS.tenants,
    tenants.map((t) => (t.id === tenantId ? after : t)),
  );
  recordAudit({
    tenant_id: tenantId,
    user_id: actorUserId,
    action: "tenant.status_change",
    entity: "tenants",
    entity_id: tenantId,
    old_value: { status: before.status },
    new_value: { status: after.status },
    reason,
  });
}

export function createUser(
  input: Omit<User, "id" | "created_at">,
  actorUserId: string | null,
): User {
  const user: User = { ...input, id: genId("user"), created_at: new Date().toISOString() };
  writeCollection(KEYS.users, [...getUsers(), user]);
  recordAudit({
    tenant_id: user.tenant_id,
    user_id: actorUserId,
    action: "user.create",
    entity: "users",
    entity_id: user.id,
    new_value: { ...user, password: undefined },
  });
  return user;
}

export function assignUserRole(userId: string, roleId: string, actorUserId: string | null): void {
  const existing = getUserRoles();
  if (existing.some((ur) => ur.user_id === userId && ur.role_id === roleId)) return;
  const role = getRoles().find((r) => r.id === roleId);
  writeCollection(KEYS.userRoles, [...existing, { user_id: userId, role_id: roleId }]);
  recordAudit({
    tenant_id: role?.tenant_id ?? DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "user_role.assign",
    entity: "user_roles",
    entity_id: userId,
    new_value: { user_id: userId, role_id: roleId },
  });
}

/** Replaces a user's entire role set with a single role — the common "change this user's role"
 * UI action. Kept separate from `assignUserRole` (which is additive) since most Mock-mode UI
 * only ever needs one role per user at a time. */
export function setUserRole(userId: string, roleId: string, actorUserId: string | null): void {
  const existing = getUserRoles();
  const before = existing.filter((ur) => ur.user_id === userId);
  writeCollection(KEYS.userRoles, [
    ...existing.filter((ur) => ur.user_id !== userId),
    { user_id: userId, role_id: roleId },
  ]);
  const role = getRoles().find((r) => r.id === roleId);
  recordAudit({
    tenant_id: role?.tenant_id ?? DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "user_role.set",
    entity: "user_roles",
    entity_id: userId,
    old_value: before,
    new_value: { user_id: userId, role_id: roleId },
  });
}

/** §11 governance — no hard delete for users either; deactivation is the only retirement path. */
export function setUserActive(userId: string, active: boolean, actorUserId: string | null): void {
  const users = getUsers();
  const before = users.find((u) => u.id === userId);
  if (!before) throw new Error("المستخدم غير موجود");
  const after: User = { ...before, active };
  writeCollection(
    KEYS.users,
    users.map((u) => (u.id === userId ? after : u)),
  );
  recordAudit({
    tenant_id: before.tenant_id,
    user_id: actorUserId,
    action: "user.status_change",
    entity: "users",
    entity_id: userId,
    old_value: { active: before.active },
    new_value: { active: after.active },
  });
}

/* ---------------- Customers (§14 — lean subset, see src/types/index.ts) ---------------- */

export function createCustomer(
  input: Omit<Customer, "id" | "tenant_id" | "code" | "status" | "created_at">,
  actorUserId: string | null,
): Customer {
  const existing = getCustomers();
  const customer: Customer = {
    ...input,
    id: genId("cust"),
    tenant_id: DEMO_TENANT_ID,
    code: nextCode("CUST", existing.length),
    status: "active",
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.customers, [...existing, customer]);
  recordAudit({
    tenant_id: customer.tenant_id,
    user_id: actorUserId,
    action: "customer.create",
    entity: "customers",
    entity_id: customer.id,
    new_value: customer,
  });
  return customer;
}

export function updateCustomer(
  id: string,
  patch: Partial<Omit<Customer, "id" | "tenant_id" | "code" | "created_at">>,
  actorUserId: string | null,
): void {
  const customers = getCustomers();
  const before = customers.find((c) => c.id === id);
  if (!before) throw new Error("العميل غير موجود");
  const after: Customer = { ...before, ...patch };
  writeCollection(
    KEYS.customers,
    customers.map((c) => (c.id === id ? after : c)),
  );
  recordAudit({
    tenant_id: before.tenant_id,
    user_id: actorUserId,
    action: "customer.update",
    entity: "customers",
    entity_id: id,
    old_value: before,
    new_value: after,
  });
}

/* ---------------- Products (§19 — lean subset, see src/types/index.ts) ---------------- */

export function createProduct(
  input: Omit<Product, "id" | "tenant_id" | "code" | "active" | "created_at">,
  actorUserId: string | null,
): Product {
  const existing = getProducts();
  const product: Product = {
    ...input,
    id: genId("prod"),
    tenant_id: DEMO_TENANT_ID,
    code: nextCode("PRD", existing.length),
    active: true,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.products, [...existing, product]);
  recordAudit({
    tenant_id: product.tenant_id,
    user_id: actorUserId,
    action: "product.create",
    entity: "products",
    entity_id: product.id,
    new_value: product,
  });
  return product;
}

export function updateProduct(
  id: string,
  patch: Partial<Omit<Product, "id" | "tenant_id" | "code" | "created_at">>,
  actorUserId: string | null,
): void {
  const products = getProducts();
  const before = products.find((p) => p.id === id);
  if (!before) throw new Error("المنتج غير موجود");
  const after: Product = { ...before, ...patch };
  writeCollection(
    KEYS.products,
    products.map((p) => (p.id === id ? after : p)),
  );
  recordAudit({
    tenant_id: before.tenant_id,
    user_id: actorUserId,
    action: "product.update",
    entity: "products",
    entity_id: id,
    old_value: before,
    new_value: after,
  });
}

/* ---------------- Inventory (§21 Serial lifecycle, §29 Movement ledger, §30 Stock Count) ---------------- */

/**
 * The one place stock ever increases. For a `serial_required` product, `serialNumbers` must
 * have exactly `quantity` entries (one physical unit per serial) — each becomes a new
 * `available` ProductSerial. Non-serialized products just need the quantity. This is what
 * Phase 5's Goods Receipt will call too — not a parallel "purchasing" code path.
 */
export function receiveStock(
  productId: string,
  quantity: number,
  serialNumbers: string[] | undefined,
  actorUserId: string | null,
  reference?: string,
): void {
  const product = getProducts().find((p) => p.id === productId);
  if (!product) throw new Error("المنتج غير موجود");
  if (quantity <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");
  if (product.serial_required) {
    const numbers = (serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
    if (numbers.length !== quantity) {
      throw new Error(`أدخل ${quantity} سيريال بالظبط (تم إدخال ${numbers.length})`);
    }
    const existing = getProductSerials();
    const duplicate = numbers.find((n) =>
      existing.some((s) => s.serial_number.toLowerCase() === n.toLowerCase()),
    );
    if (duplicate) throw new Error(`السيريال "${duplicate}" مسجّل بالفعل`);
    const now = new Date().toISOString();
    const newSerials: ProductSerial[] = numbers.map((serial_number) => ({
      id: genId("serial"),
      tenant_id: product.tenant_id,
      product_id: productId,
      serial_number,
      status: "available",
      created_at: now,
    }));
    writeCollection(KEYS.productSerials, [...existing, ...newSerials]);
  }

  const before = getProductStock(productId, product);
  const after = before + quantity;
  const movement: InventoryMovement = {
    id: genId("mov"),
    tenant_id: product.tenant_id,
    product_id: productId,
    type: "receipt",
    quantity,
    before,
    after,
    user_id: actorUserId,
    ...(reference ? { reference } : {}),
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), movement]);
  recordAudit({
    tenant_id: product.tenant_id,
    user_id: actorUserId,
    action: "inventory.receive",
    entity: "inventory_movements",
    entity_id: movement.id,
    new_value: movement,
  });
}

/**
 * §30 Stock Count. Serialized products are deliberately excluded here — their accuracy comes
 * from the serial list itself (§21), not a count number; counting them is a future "verify
 * each serial is physically present" flow, not this simple adjustment.
 */
export function adjustStock(
  productId: string,
  actualQuantity: number,
  reason: string,
  actorUserId: string | null,
): { before: number; after: number; diff: number } {
  const product = getProducts().find((p) => p.id === productId);
  if (!product) throw new Error("المنتج غير موجود");
  if (product.serial_required) {
    throw new Error("منتجات السيريال لا تُجرد بهذه الطريقة");
  }
  const before = getProductStock(productId, product);
  const diff = actualQuantity - before;
  if (diff === 0) return { before, after: before, diff: 0 };

  const movement: InventoryMovement = {
    id: genId("mov"),
    tenant_id: product.tenant_id,
    product_id: productId,
    type: "adjustment",
    quantity: diff,
    before,
    after: actualQuantity,
    user_id: actorUserId,
    reason,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), movement]);
  recordAudit({
    tenant_id: product.tenant_id,
    user_id: actorUserId,
    action: "inventory.adjust",
    entity: "inventory_movements",
    entity_id: movement.id,
    new_value: movement,
    reason,
  });
  return { before, after: actualQuantity, diff };
}

/* ---------------- Guarantors (§15) ---------------- */

export function createGuarantor(
  input: Omit<Guarantor, "id" | "tenant_id" | "created_at">,
  actorUserId: string | null,
): Guarantor {
  const guarantor: Guarantor = {
    ...input,
    id: genId("guar"),
    tenant_id: DEMO_TENANT_ID,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.guarantors, [...getGuarantors(), guarantor]);
  recordAudit({
    tenant_id: guarantor.tenant_id,
    user_id: actorUserId,
    action: "guarantor.create",
    entity: "guarantors",
    entity_id: guarantor.id,
    new_value: guarantor,
  });
  return guarantor;
}

/* ---------------- Sales / Cash Sale (§32, §34) ---------------- */

function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const count = getSales().filter((s) => s.invoice_number.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

export interface CreateSaleInput {
  customer_id: string | null;
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  /** Percentage 0-100. Must not exceed `TenantSettings.employee_discount_limit_pct` — the
   * spec's Approval Engine (§105) for overriding this is a later, real Phase, not faked here. */
  discount_pct: number;
}

/**
 * One atomic Mock "transaction": validates every line (stock/serial availability, employee
 * discount cap), then applies every inventory effect (serial → sold, ledger movements) and
 * writes the Sale itself. §102 wants this atomic against a real database — here that just
 * means "validate everything before writing anything," which the loop below does.
 */
export function createSale(input: CreateSaleInput, actorUserId: string | null): Sale {
  if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const settings = getCurrentTenantSettings();
  if (input.discount_pct < 0 || input.discount_pct > settings.employee_discount_limit_pct) {
    throw new Error(
      `أقصى خصم مسموح بدون اعتماد مدير هو ${settings.employee_discount_limit_pct}% (يمكن تعديله من الإعدادات)`,
    );
  }

  const products = getProducts();
  const allSerials = getProductSerials();
  const customer = input.customer_id
    ? getCustomers().find((c) => c.id === input.customer_id)
    : null;
  if (input.customer_id && !customer) throw new Error("العميل غير موجود");

  const saleItems: SaleItem[] = [];
  const soldSerialIds = new Set<string>();
  const stockTracker = new Map<string, number>();
  const movementDrafts: Array<{
    product_id: string;
    quantity: number;
    before: number;
    after: number;
  }> = [];

  for (const line of input.items) {
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");
    if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);

    const currentStock = stockTracker.get(product.id) ?? getProductStock(product.id, product);

    if (product.serial_required) {
      if (line.quantity !== 1) {
        throw new Error(`المنتج "${product.name}" يُباع سيريال واحد لكل سطر`);
      }
      if (!line.serial_id) throw new Error(`اختر سيريال للمنتج "${product.name}"`);
      if (soldSerialIds.has(line.serial_id)) {
        throw new Error("لا يمكن بيع نفس السيريال مرتين في نفس الفاتورة");
      }
      const serial = allSerials.find((s) => s.id === line.serial_id && s.product_id === product.id);
      if (!serial) throw new Error("السيريال غير موجود");
      if (serial.status !== "available") {
        throw new Error(`السيريال "${serial.serial_number}" غير متاح للبيع`);
      }
      soldSerialIds.add(serial.id);
      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        serial_id: serial.id,
        serial_number: serial.serial_number,
        quantity: 1,
        unit_price: product.cash_price,
        line_total: product.cash_price,
      });
      stockTracker.set(product.id, currentStock - 1);
      movementDrafts.push({
        product_id: product.id,
        quantity: -1,
        before: currentStock,
        after: currentStock - 1,
      });
    } else {
      if (line.quantity <= 0) throw new Error(`كمية غير صحيحة للمنتج "${product.name}"`);
      if (line.quantity > currentStock) {
        throw new Error(`المخزون غير كافٍ للمنتج "${product.name}" (متاح ${currentStock})`);
      }
      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: product.cash_price,
        line_total: product.cash_price * line.quantity,
      });
      stockTracker.set(product.id, currentStock - line.quantity);
      movementDrafts.push({
        product_id: product.id,
        quantity: -line.quantity,
        before: currentStock,
        after: currentStock - line.quantity,
      });
    }
  }

  const subtotal = saleItems.reduce((sum, i) => sum + i.line_total, 0);
  const discount_amount = Math.round(subtotal * (input.discount_pct / 100) * 100) / 100;
  const total = Math.round((subtotal - discount_amount) * 100) / 100;

  const sale: Sale = {
    id: genId("sale"),
    tenant_id: DEMO_TENANT_ID,
    invoice_number: nextInvoiceNumber(),
    customer_id: input.customer_id,
    customer_name: customer?.name ?? "عميل نقدي",
    items: saleItems,
    subtotal,
    discount_pct: input.discount_pct,
    discount_amount,
    total,
    user_id: actorUserId,
    status: "completed",
    created_at: new Date().toISOString(),
  };

  if (soldSerialIds.size > 0) {
    writeCollection(
      KEYS.productSerials,
      allSerials.map((s) => (soldSerialIds.has(s.id) ? { ...s, status: "sold" as const } : s)),
    );
  }

  const now = new Date().toISOString();
  const newMovements: InventoryMovement[] = movementDrafts.map((m) => ({
    id: genId("mov"),
    tenant_id: DEMO_TENANT_ID,
    product_id: m.product_id,
    type: "sale",
    quantity: m.quantity,
    before: m.before,
    after: m.after,
    user_id: actorUserId,
    reference: sale.invoice_number,
    created_at: now,
  }));
  writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), ...newMovements]);
  writeCollection(KEYS.sales, [...getSales(), sale]);

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "sale.create",
    entity: "sales",
    entity_id: sale.id,
    new_value: sale,
  });

  postTreasuryMovement(CASHIER_ACCOUNT_ID, sale.total, "sale", actorUserId, sale.invoice_number);
  postJournalEntry(
    [
      { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: sale.total, credit: 0 },
      { account_code: "3000", account_name: ACCOUNT_NAMES["3000"], debit: 0, credit: sale.total },
    ],
    `بيع نقدي ${sale.invoice_number}`,
    "sale",
    sale.id,
  );

  return sale;
}

/* ---------------- Installment Plans (§38, Owner-managed) ---------------- */

export function createInstallmentPlan(
  input: Omit<InstallmentPlan, "id" | "tenant_id" | "active" | "created_at">,
  actorUserId: string | null,
): InstallmentPlan {
  if (input.duration_months <= 0) throw new Error("مدة الخطة يجب أن تكون أكبر من صفر");
  if (input.rate_pct < 0) throw new Error("نسبة التمويل لا يمكن أن تكون سالبة");
  const plan: InstallmentPlan = {
    ...input,
    id: genId("plan"),
    tenant_id: DEMO_TENANT_ID,
    active: true,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.installmentPlans, [...getInstallmentPlans(), plan]);
  recordAudit({
    tenant_id: plan.tenant_id,
    user_id: actorUserId,
    action: "installment_plan.create",
    entity: "installment_plans",
    entity_id: plan.id,
    new_value: plan,
  });
  return plan;
}

/** §11/§114 governance — deactivating a plan never touches contracts already created from it
 * (their rate/duration are frozen snapshots on the contract itself); it only hides the plan
 * from new-contract pickers. No hard delete. */
export function setInstallmentPlanActive(
  id: string,
  active: boolean,
  actorUserId: string | null,
): void {
  const plans = getInstallmentPlans();
  const before = plans.find((p) => p.id === id);
  if (!before) throw new Error("خطة التقسيط غير موجودة");
  const after: InstallmentPlan = { ...before, active };
  writeCollection(
    KEYS.installmentPlans,
    plans.map((p) => (p.id === id ? after : p)),
  );
  recordAudit({
    tenant_id: before.tenant_id,
    user_id: actorUserId,
    action: "installment_plan.set_active",
    entity: "installment_plans",
    entity_id: id,
    old_value: { active: before.active },
    new_value: { active: after.active },
  });
}

/* ---------------- Installment Contracts (§35/§37/§41/§43) ---------------- */

function nextContractNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `CON-${year}-`;
  const count = getInstallmentContracts().filter((c) =>
    c.contract_number.startsWith(prefix),
  ).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

export interface CreateInstallmentContractInput {
  customer_id: string;
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  down_payment: number;
  plan_id: string;
}

/**
 * The installment sale flow. Same "validate everything, then write everything" discipline as
 * `createSale`, plus the checks unique to credit: active customer, active plan, Credit Hold
 * (§56), minimum down payment (§39), and Credit Check (§57: `Available Credit = credit_limit -
 * Current Exposure`). Pricing uses `product.installment_price`, never `cash_price` (§25).
 *
 * The plan's `rate_pct`/`duration_months` are snapshotted onto the contract right here (§114)
 * — `calculateFinance`/`generateSchedule` (verified against the spec's own acceptance test in
 * scripts/verify-finance-engine.ts) never get called again for this contract after this
 * function returns, so a later edit to the plan can never change it.
 */
export function createInstallmentContract(
  input: CreateInstallmentContractInput,
  actorUserId: string | null,
): InstallmentContract {
  if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const customer = getCustomers().find((c) => c.id === input.customer_id);
  if (!customer) throw new Error("العميل غير موجود");
  if (customer.status !== "active") throw new Error("العميل غير نشط");

  const plan = getInstallmentPlans().find((p) => p.id === input.plan_id);
  if (!plan) throw new Error("خطة التقسيط غير موجودة");
  if (!plan.active) throw new Error("خطة التقسيط غير مفعّلة");

  const settings = getCurrentTenantSettings();
  if (isCustomerOnCreditHold(customer.id, settings.credit_hold_days)) {
    throw new Error("العميل موقوف عن التقسيط لتأخره في السداد (Credit Hold) — راجع صفحة العميل");
  }

  const products = getProducts();
  const allSerials = getProductSerials();

  const saleItems: SaleItem[] = [];
  const soldSerialIds = new Set<string>();
  const stockTracker = new Map<string, number>();
  const movementDrafts: Array<{
    product_id: string;
    quantity: number;
    before: number;
    after: number;
  }> = [];

  for (const line of input.items) {
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");
    if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);

    const currentStock = stockTracker.get(product.id) ?? getProductStock(product.id, product);

    if (product.serial_required) {
      if (line.quantity !== 1) {
        throw new Error(`المنتج "${product.name}" يُباع سيريال واحد لكل سطر`);
      }
      if (!line.serial_id) throw new Error(`اختر سيريال للمنتج "${product.name}"`);
      if (soldSerialIds.has(line.serial_id)) {
        throw new Error("لا يمكن بيع نفس السيريال مرتين في نفس العقد");
      }
      const serial = allSerials.find((s) => s.id === line.serial_id && s.product_id === product.id);
      if (!serial) throw new Error("السيريال غير موجود");
      if (serial.status !== "available") {
        throw new Error(`السيريال "${serial.serial_number}" غير متاح للبيع`);
      }
      soldSerialIds.add(serial.id);
      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        serial_id: serial.id,
        serial_number: serial.serial_number,
        quantity: 1,
        unit_price: product.installment_price,
        line_total: product.installment_price,
      });
      stockTracker.set(product.id, currentStock - 1);
      movementDrafts.push({
        product_id: product.id,
        quantity: -1,
        before: currentStock,
        after: currentStock - 1,
      });
    } else {
      if (line.quantity <= 0) throw new Error(`كمية غير صحيحة للمنتج "${product.name}"`);
      if (line.quantity > currentStock) {
        throw new Error(`المخزون غير كافٍ للمنتج "${product.name}" (متاح ${currentStock})`);
      }
      saleItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: product.installment_price,
        line_total: product.installment_price * line.quantity,
      });
      stockTracker.set(product.id, currentStock - line.quantity);
      movementDrafts.push({
        product_id: product.id,
        quantity: -line.quantity,
        before: currentStock,
        after: currentStock - line.quantity,
      });
    }
  }

  const cash_subtotal = saleItems.reduce((sum, i) => sum + i.line_total, 0);

  if (input.down_payment < 0) throw new Error("المقدّم لا يمكن أن يكون سالبًا");
  const minDownPayment =
    Math.round(cash_subtotal * (settings.min_down_payment_pct / 100) * 100) / 100;
  if (input.down_payment < minDownPayment) {
    throw new Error(
      `الحد الأدنى للمقدّم ${minDownPayment} ج.م (${settings.min_down_payment_pct}% من قيمة البضاعة)`,
    );
  }
  if (input.down_payment >= cash_subtotal) {
    throw new Error("المقدّم يغطي كامل القيمة — استخدم البيع النقدي بدلاً من التقسيط");
  }

  const principal = Math.round((cash_subtotal - input.down_payment) * 100) / 100;
  const { financeAmount, totalAmount } = calculateFinance(principal, plan.rate_pct);

  const exposure = getCustomerExposure(customer.id);
  const availableCredit = customer.credit_limit - exposure;
  if (totalAmount > availableCredit) {
    throw new Error(
      `تجاوز حد الائتمان: المتاح ${availableCredit} ج.م، والعقد يحتاج ${totalAmount} ج.م (الحد الكلي ${customer.credit_limit} ج.م، المستحق حاليًا ${exposure} ج.م)`,
    );
  }

  const schedule = generateSchedule(totalAmount, plan.duration_months);
  const created_at = new Date().toISOString();

  const contract: InstallmentContract = {
    id: genId("contract"),
    tenant_id: DEMO_TENANT_ID,
    contract_number: nextContractNumber(),
    customer_id: customer.id,
    customer_name: customer.name,
    items: saleItems,
    cash_subtotal,
    down_payment: input.down_payment,
    principal,
    plan_id: plan.id,
    plan_duration_months: plan.duration_months,
    plan_rate_pct: plan.rate_pct,
    finance_amount: financeAmount,
    total_amount: totalAmount,
    installment_amount: schedule[0]?.amount ?? 0,
    status: "active",
    user_id: actorUserId,
    created_at,
  };

  const installments: Installment[] = schedule.map((line) => ({
    id: genId("inst"),
    tenant_id: DEMO_TENANT_ID,
    contract_id: contract.id,
    seq: line.seq,
    due_date: line.due_date,
    amount: line.amount,
    paid_amount: 0,
    status: "scheduled",
    created_at,
  }));

  if (soldSerialIds.size > 0) {
    writeCollection(
      KEYS.productSerials,
      allSerials.map((s) => (soldSerialIds.has(s.id) ? { ...s, status: "sold" as const } : s)),
    );
  }

  const newMovements: InventoryMovement[] = movementDrafts.map((m) => ({
    id: genId("mov"),
    tenant_id: DEMO_TENANT_ID,
    product_id: m.product_id,
    type: "sale",
    quantity: m.quantity,
    before: m.before,
    after: m.after,
    user_id: actorUserId,
    reference: contract.contract_number,
    created_at,
  }));
  writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), ...newMovements]);
  writeCollection(KEYS.installmentContracts, [...getInstallmentContracts(), contract]);
  writeCollection(KEYS.installments, [...getInstallments(), ...installments]);

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "installment_contract.create",
    entity: "installment_contracts",
    entity_id: contract.id,
    new_value: contract,
  });

  if (contract.down_payment > 0) {
    postTreasuryMovement(
      CASHIER_ACCOUNT_ID,
      contract.down_payment,
      "sale",
      actorUserId,
      contract.contract_number,
    );
  }
  // §75 — Product Profit (cash_subtotal) is kept separate from Financing Revenue
  // (finance_amount): Dr Cash (down payment) + Dr Customers (what's still owed) balances
  // against Cr Sales Revenue (goods value) + Cr Financing Revenue.
  postJournalEntry(
    [
      ...(contract.down_payment > 0
        ? [
            {
              account_code: "1000" as const,
              account_name: ACCOUNT_NAMES["1000"],
              debit: contract.down_payment,
              credit: 0,
            },
          ]
        : []),
      {
        // The customer owes principal + finance_amount (contract.total_amount), not just the
        // principal — the AR line must carry the full amount still outstanding after the down
        // payment for the entry to balance against both revenue lines below.
        account_code: "1100",
        account_name: ACCOUNT_NAMES["1100"],
        debit: contract.total_amount,
        credit: 0,
      },
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"],
        debit: 0,
        credit: contract.cash_subtotal,
      },
      {
        account_code: "3100",
        account_name: ACCOUNT_NAMES["3100"],
        debit: 0,
        credit: contract.finance_amount,
      },
    ],
    `عقد تقسيط ${contract.contract_number}`,
    "installment_contract",
    contract.id,
  );

  return contract;
}

/* ---------------- Collections (§46, §52, §54/§55) ---------------- */

function nextReceiptNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `REC-${year}-`;
  const count = getInstallmentPayments().filter((p) => p.receipt_number.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

/**
 * §46 Oldest-Due-First allocation. Validates the whole payment against the contract's total
 * outstanding balance before writing anything (reject rather than silently cap), then splits it
 * across installments in `seq` order. Receipt numbers are sequential/unique/immutable (§55) —
 * no function here or anywhere else ever edits or deletes an `InstallmentPayment`.
 */
export function collectPayment(
  contractId: string,
  amount: number,
  actorUserId: string | null,
): InstallmentPayment {
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");

  const contract = getInstallmentContracts().find((c) => c.id === contractId);
  if (!contract) throw new Error("العقد غير موجود");

  const allInstallments = getInstallments();
  const contractInstallments = allInstallments
    .filter(
      (i) => i.contract_id === contractId && i.status !== "waived" && i.status !== "rescheduled",
    )
    .sort((a, b) => a.seq - b.seq);

  const totalOwed =
    Math.round(
      contractInstallments.reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0) * 100,
    ) / 100;
  if (totalOwed <= 0) throw new Error("لا يوجد أقساط مستحقة على هذا العقد");
  if (amount > totalOwed) {
    throw new Error(`المبلغ (${amount}) أكبر من إجمالي المتبقي على العقد (${totalOwed} ج.م)`);
  }

  let remaining = amount;
  const allocations: Array<{ installment_id: string; amount: number }> = [];
  const updatedById = new Map<string, Installment>();

  for (const inst of contractInstallments) {
    if (remaining <= 0) break;
    const owed = Math.round((inst.amount - inst.paid_amount) * 100) / 100;
    if (owed <= 0) continue;
    const apply = Math.min(owed, remaining);
    allocations.push({ installment_id: inst.id, amount: apply });
    const newPaid = Math.round((inst.paid_amount + apply) * 100) / 100;
    updatedById.set(inst.id, {
      ...inst,
      paid_amount: newPaid,
      status: newPaid >= inst.amount ? "paid" : "partially_paid",
    });
    remaining = Math.round((remaining - apply) * 100) / 100;
  }

  const payment: InstallmentPayment = {
    id: genId("pay"),
    tenant_id: DEMO_TENANT_ID,
    contract_id: contractId,
    receipt_number: nextReceiptNumber(),
    amount,
    allocations,
    user_id: actorUserId,
    created_at: new Date().toISOString(),
  };

  writeCollection(
    KEYS.installments,
    allInstallments.map((i) => updatedById.get(i.id) ?? i),
  );
  writeCollection(KEYS.installmentPayments, [...getInstallmentPayments(), payment]);

  const refreshed = getInstallments().filter(
    (i) => i.contract_id === contractId && i.status !== "waived" && i.status !== "rescheduled",
  );
  const allPaid = refreshed.every((i) => i.status === "paid");
  const anyPaid = refreshed.some((i) => i.paid_amount > 0);
  const nextStatus: InstallmentContract["status"] = allPaid
    ? "settled"
    : anyPaid
      ? "partially_paid"
      : contract.status;
  if (nextStatus !== contract.status) {
    writeCollection(
      KEYS.installmentContracts,
      getInstallmentContracts().map((c) =>
        c.id === contractId ? { ...c, status: nextStatus } : c,
      ),
    );
  }

  // §51 — a payment landing on/before its due date keeps the promise; a promise whose date has
  // already passed unpaid is left "pending" here and reported as "failed" by
  // `getEffectivePromiseStatus` (computed on read, same pattern as installment overdue).
  const keepablePromiseIds = getPromisesToPay()
    .filter(
      (p) =>
        p.contract_id === contractId &&
        p.status === "pending" &&
        new Date() <= new Date(p.promise_date),
    )
    .map((p) => p.id);
  if (keepablePromiseIds.length > 0) {
    writeCollection(
      KEYS.promisesToPay,
      getPromisesToPay().map((p) =>
        keepablePromiseIds.includes(p.id) ? { ...p, status: "kept" as const } : p,
      ),
    );
  }

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "installment_payment.collect",
    entity: "installment_payments",
    entity_id: payment.id,
    new_value: payment,
  });

  postTreasuryMovement(
    CASHIER_ACCOUNT_ID,
    amount,
    "collection",
    actorUserId,
    payment.receipt_number,
  );
  postJournalEntry(
    [
      { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: amount, credit: 0 },
      { account_code: "1100", account_name: ACCOUNT_NAMES["1100"], debit: 0, credit: amount },
    ],
    `تحصيل ${payment.receipt_number}`,
    "installment_payment",
    payment.id,
  );

  return payment;
}

/* ---------------- Promise to Pay (§51) ---------------- */

export function recordPromise(
  contractId: string,
  promiseDate: string,
  expectedAmount: number,
  notes: string | undefined,
  actorUserId: string | null,
): PromiseToPay {
  const contract = getInstallmentContracts().find((c) => c.id === contractId);
  if (!contract) throw new Error("العقد غير موجود");
  if (expectedAmount <= 0) throw new Error("المبلغ المتوقع يجب أن يكون أكبر من صفر");

  const promise: PromiseToPay = {
    id: genId("promise"),
    tenant_id: DEMO_TENANT_ID,
    contract_id: contractId,
    promise_date: promiseDate,
    expected_amount: expectedAmount,
    ...(notes?.trim() && { notes: notes.trim() }),
    user_id: actorUserId,
    status: "pending",
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.promisesToPay, [...getPromisesToPay(), promise]);
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "promise_to_pay.record",
    entity: "promises_to_pay",
    entity_id: promise.id,
    new_value: promise,
  });
  return promise;
}

/** Computed on read, same pattern as `getEffectiveInstallmentStatus` — a "pending" promise past
 * its date reads as "failed" without ever being persisted that way, so a later payment before
 * anyone looked at it can still legitimately flip it to "kept" in `collectPayment`. */
export function getEffectivePromiseStatus(promise: PromiseToPay): PromiseToPay["status"] {
  if (promise.status !== "pending") return promise.status;
  return new Date() > new Date(promise.promise_date) ? "failed" : "pending";
}

/* ---------------- Early Settlement (§47) / Restructuring (§48) ---------------- */

/**
 * Pays off every remaining installment in one go via the same `collectPayment` allocation path
 * (so the receipt/audit trail looks identical to a normal payment), then marks the contract
 * `settled_early` — distinct from the `settled` a normal last-installment payment would set —
 * so reporting can tell a customer paid off ahead of schedule apart from one who just finished
 * on time.
 */
export function earlySettleContract(
  contractId: string,
  actorUserId: string | null,
): InstallmentPayment {
  const contract = getInstallmentContracts().find((c) => c.id === contractId);
  if (!contract) throw new Error("العقد غير موجود");
  if (contract.status === "settled" || contract.status === "settled_early") {
    throw new Error("العقد مسدد بالكامل بالفعل");
  }

  const outstanding = getInstallments().filter(
    (i) => i.contract_id === contractId && i.status !== "waived" && i.status !== "rescheduled",
  );
  const remaining =
    Math.round(
      outstanding.reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0) * 100,
    ) / 100;
  if (remaining <= 0) throw new Error("لا يوجد مبلغ متبقي لتسويته");

  const payment = collectPayment(contractId, remaining, actorUserId);

  writeCollection(
    KEYS.installmentContracts,
    getInstallmentContracts().map((c) =>
      c.id === contractId ? { ...c, status: "settled_early" as const } : c,
    ),
  );
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "installment_contract.settle_early",
    entity: "installment_contracts",
    entity_id: contractId,
    new_value: { remaining, payment_id: payment.id },
  });

  return payment;
}

/**
 * Never mutates or deletes the original schedule (§48/§11 governance): every currently-
 * outstanding installment gets `status: "rescheduled"` (kept forever as history) and brand-new
 * `Installment` rows are appended for the remaining balance spread evenly over
 * `newDurationMonths` (no additional finance is applied on top — restructuring extends the term
 * of what's already owed, it isn't a new loan). A `RestructureEvent` links old → new.
 */
export function restructureContract(
  contractId: string,
  newDurationMonths: number,
  reason: string,
  actorUserId: string | null,
): RestructureEvent {
  if (newDurationMonths <= 0) throw new Error("مدة إعادة الهيكلة يجب أن تكون أكبر من صفر");
  if (!reason.trim()) throw new Error("سبب إعادة الهيكلة مطلوب");

  const contract = getInstallmentContracts().find((c) => c.id === contractId);
  if (!contract) throw new Error("العقد غير موجود");
  if (contract.status === "settled" || contract.status === "settled_early") {
    throw new Error("العقد مسدد بالكامل، لا يمكن إعادة هيكلته");
  }

  const allInstallments = getInstallments();
  const contractInstallments = allInstallments.filter((i) => i.contract_id === contractId);
  const outstanding = contractInstallments.filter(
    (i) => i.status !== "waived" && i.status !== "rescheduled" && i.amount > i.paid_amount,
  );
  if (outstanding.length === 0) throw new Error("لا يوجد أقساط متبقية لإعادة هيكلتها");

  const remaining =
    Math.round(outstanding.reduce((sum, i) => sum + (i.amount - i.paid_amount), 0) * 100) / 100;
  const oldInstallmentIds = outstanding.map((i) => i.id);

  const schedule = generateSchedule(remaining, newDurationMonths);
  const maxSeq = Math.max(0, ...contractInstallments.map((i) => i.seq));
  const created_at = new Date().toISOString();
  const newInstallments: Installment[] = schedule.map((line, index) => ({
    id: genId("inst"),
    tenant_id: DEMO_TENANT_ID,
    contract_id: contractId,
    seq: maxSeq + index + 1,
    due_date: line.due_date,
    amount: line.amount,
    paid_amount: 0,
    status: "scheduled",
    created_at,
  }));

  writeCollection(KEYS.installments, [
    ...allInstallments.map((i) =>
      oldInstallmentIds.includes(i.id) ? { ...i, status: "rescheduled" as const } : i,
    ),
    ...newInstallments,
  ]);

  const event: RestructureEvent = {
    id: genId("restruct"),
    tenant_id: DEMO_TENANT_ID,
    contract_id: contractId,
    old_installment_ids: oldInstallmentIds,
    remaining_amount: remaining,
    new_duration_months: newDurationMonths,
    reason: reason.trim(),
    user_id: actorUserId,
    created_at,
  };
  writeCollection(KEYS.restructureEvents, [...getRestructureEvents(), event]);
  writeCollection(
    KEYS.installmentContracts,
    getInstallmentContracts().map((c) =>
      c.id === contractId ? { ...c, status: "restructured" as const } : c,
    ),
  );

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "installment_contract.restructure",
    entity: "installment_contracts",
    entity_id: contractId,
    new_value: event,
    reason: reason.trim(),
  });

  return event;
}

/* ---------------- Suppliers (§60) ---------------- */

export function createSupplier(
  input: Omit<Supplier, "id" | "tenant_id" | "code" | "active" | "created_at">,
  actorUserId: string | null,
): Supplier {
  const existing = getSuppliers();
  const supplier: Supplier = {
    ...input,
    id: genId("supplier"),
    tenant_id: DEMO_TENANT_ID,
    code: nextCode("SUP", existing.length),
    active: true,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.suppliers, [...existing, supplier]);
  recordAudit({
    tenant_id: supplier.tenant_id,
    user_id: actorUserId,
    action: "supplier.create",
    entity: "suppliers",
    entity_id: supplier.id,
    new_value: supplier,
  });
  return supplier;
}

export function updateSupplier(
  id: string,
  patch: Partial<Omit<Supplier, "id" | "tenant_id" | "code" | "created_at">>,
  actorUserId: string | null,
): void {
  const suppliers = getSuppliers();
  const before = suppliers.find((s) => s.id === id);
  if (!before) throw new Error("المورد غير موجود");
  const after: Supplier = { ...before, ...patch };
  writeCollection(
    KEYS.suppliers,
    suppliers.map((s) => (s.id === id ? after : s)),
  );
  recordAudit({
    tenant_id: before.tenant_id,
    user_id: actorUserId,
    action: "supplier.update",
    entity: "suppliers",
    entity_id: id,
    old_value: before,
    new_value: after,
  });
}

/* ---------------- Purchasing (§61-§65) ---------------- */

function nextPurchaseNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `PUR-${year}-`;
  const count = getPurchases().filter((p) => p.purchase_number.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

export interface CreatePurchaseInput {
  supplier_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_cost: number;
    serial_numbers?: string[];
  }>;
}

/**
 * Combines Purchase Request and Goods Receipt into one action (see the `Purchase` type
 * comment). Validates every line before writing anything, then applies each line's inventory
 * effect through `receiveStock` — the exact same function a manual "receive stock" click on a
 * product's detail page calls, not a parallel path — so serial/ledger behavior can never drift
 * between the two entry points. Cost is then updated per `TenantSettings.costing_method`;
 * "fifo" isn't distinctly implemented in Mock mode (no per-lot tracking) and falls back to the
 * same weighted-average math as "average" — a documented simplification, not a bug.
 */
export function createPurchase(input: CreatePurchaseInput, actorUserId: string | null): Purchase {
  if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

  const supplier = getSuppliers().find((s) => s.id === input.supplier_id);
  if (!supplier) throw new Error("المورد غير موجود");
  if (!supplier.active) throw new Error("المورد غير نشط");

  const products = getProducts();
  const existingSerials = getProductSerials();
  const seenSerialsThisPurchase = new Set<string>();

  const purchaseItems: PurchaseItem[] = [];
  for (const line of input.items) {
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");
    if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);
    if (line.quantity <= 0) throw new Error(`كمية غير صحيحة للمنتج "${product.name}"`);
    if (line.unit_cost < 0) throw new Error(`سعر تكلفة غير صحيح للمنتج "${product.name}"`);

    const serials = (line.serial_numbers ?? []).map((s) => s.trim()).filter(Boolean);
    if (product.serial_required) {
      if (serials.length !== line.quantity) {
        throw new Error(`أدخل ${line.quantity} سيريال بالظبط للمنتج "${product.name}"`);
      }
      for (const serial of serials) {
        const key = serial.toLowerCase();
        if (seenSerialsThisPurchase.has(key)) {
          throw new Error(`السيريال "${serial}" مكرر في نفس أمر الشراء`);
        }
        if (existingSerials.some((s) => s.serial_number.toLowerCase() === key)) {
          throw new Error(`السيريال "${serial}" مسجّل بالفعل`);
        }
        seenSerialsThisPurchase.add(key);
      }
    }

    purchaseItems.push({
      product_id: product.id,
      product_name: product.name,
      serial_numbers: serials,
      quantity: line.quantity,
      unit_cost: line.unit_cost,
      line_total: Math.round(line.unit_cost * line.quantity * 100) / 100,
    });
  }

  const purchase_number = nextPurchaseNumber();
  const settings = getCurrentTenantSettings();

  // Every line already validated above, so applying effects here can't fail partway through.
  for (const item of purchaseItems) {
    const productBefore = products.find((p) => p.id === item.product_id)!;
    const stockBefore = getProductStock(item.product_id, productBefore);

    receiveStock(
      item.product_id,
      item.quantity,
      item.serial_numbers.length > 0 ? item.serial_numbers : undefined,
      actorUserId,
      purchase_number,
    );

    const newCost =
      settings.costing_method === "last_purchase"
        ? item.unit_cost
        : stockBefore + item.quantity > 0
          ? Math.round(
              ((stockBefore * productBefore.cost_price + item.quantity * item.unit_cost) /
                (stockBefore + item.quantity)) *
                100,
            ) / 100
          : item.unit_cost;
    updateProduct(item.product_id, { cost_price: newCost }, actorUserId);
  }

  const total = Math.round(purchaseItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
  const purchase: Purchase = {
    id: genId("purchase"),
    tenant_id: DEMO_TENANT_ID,
    purchase_number,
    supplier_id: supplier.id,
    supplier_name: supplier.name,
    items: purchaseItems,
    total,
    user_id: actorUserId,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.purchases, [...getPurchases(), purchase]);

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "purchase.create",
    entity: "purchases",
    entity_id: purchase.id,
    new_value: purchase,
  });

  // No treasury movement here — the purchase creates a payable (§65), it doesn't pay cash
  // immediately; `recordSupplierPayment` is what moves money later.
  postJournalEntry(
    [
      { account_code: "1200", account_name: ACCOUNT_NAMES["1200"], debit: total, credit: 0 },
      { account_code: "2000", account_name: ACCOUNT_NAMES["2000"], debit: 0, credit: total },
    ],
    `أمر شراء ${purchase_number}`,
    "purchase",
    purchase.id,
  );

  return purchase;
}

/** §65 — validates against `getSupplierBalance` before writing so a payment can never push a
 * supplier's balance negative. */
export function recordSupplierPayment(
  supplierId: string,
  amount: number,
  actorUserId: string | null,
): SupplierPayment {
  const supplier = getSuppliers().find((s) => s.id === supplierId);
  if (!supplier) throw new Error("المورد غير موجود");
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  const balance = getSupplierBalance(supplierId);
  if (amount > balance) {
    throw new Error(`المبلغ أكبر من الرصيد المستحق للمورد (${balance} ج.م)`);
  }

  const payment: SupplierPayment = {
    id: genId("suppay"),
    tenant_id: DEMO_TENANT_ID,
    supplier_id: supplierId,
    amount,
    user_id: actorUserId,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.supplierPayments, [...getSupplierPayments(), payment]);
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "supplier_payment.record",
    entity: "supplier_payments",
    entity_id: payment.id,
    new_value: payment,
  });

  postTreasuryMovement(
    MAIN_ACCOUNT_ID,
    -amount,
    "purchase_payment",
    actorUserId,
    undefined,
    undefined,
  );
  postJournalEntry(
    [
      { account_code: "2000", account_name: ACCOUNT_NAMES["2000"], debit: amount, credit: 0 },
      { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: 0, credit: amount },
    ],
    `دفعة لمورد ${supplier.name}`,
    "supplier_payment",
    payment.id,
  );

  return payment;
}

/* ---------------- Treasury (§68) ---------------- */

function postTreasuryMovement(
  accountId: string,
  amount: number,
  type: TreasuryMovement["type"],
  actorUserId: string | null,
  reference?: string,
  reason?: string,
): TreasuryMovement {
  const before = getAccountBalance(accountId);
  const after = Math.round((before + amount) * 100) / 100;
  const movement: TreasuryMovement = {
    id: genId("tmov"),
    tenant_id: DEMO_TENANT_ID,
    account_id: accountId,
    type,
    amount,
    before,
    after,
    user_id: actorUserId,
    ...(reference ? { reference } : {}),
    ...(reason ? { reason } : {}),
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.treasuryMovements, [...getTreasuryMovements(), movement]);
  return movement;
}

/* ---------------- Shifts (§70) ---------------- */

export function openShift(
  accountId: string,
  openingBalance: number,
  actorUserId: string | null,
): Shift {
  const account = getTreasuryAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("الخزينة غير موجودة");
  if (getShifts().some((s) => s.account_id === accountId && s.status === "open")) {
    throw new Error("يوجد وردية مفتوحة بالفعل على هذه الخزينة");
  }
  if (openingBalance < 0) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالبًا");

  const shift: Shift = {
    id: genId("shift"),
    tenant_id: DEMO_TENANT_ID,
    account_id: accountId,
    opening_balance: openingBalance,
    opened_by: actorUserId,
    opened_at: new Date().toISOString(),
    status: "open",
  };
  writeCollection(KEYS.shifts, [...getShifts(), shift]);
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "shift.open",
    entity: "shifts",
    entity_id: shift.id,
    new_value: shift,
  });
  return shift;
}

/**
 * §70 — expected balance is `opening_balance` plus every movement on that account since
 * `opened_at` (never a value carried forward and trusted blindly). A reason is mandatory
 * whenever the counted amount doesn't match, matching "فرق الجرد لازم سبب موثق" (§130).
 */
export function closeShift(
  shiftId: string,
  countedAmount: number,
  reason: string | undefined,
  actorUserId: string | null,
): Shift {
  const shifts = getShifts();
  const shift = shifts.find((s) => s.id === shiftId);
  if (!shift) throw new Error("الوردية غير موجودة");
  if (shift.status === "closed") throw new Error("الوردية مقفلة بالفعل");

  const netMovement = getTreasuryMovements()
    .filter((m) => m.account_id === shift.account_id && m.created_at >= shift.opened_at)
    .reduce((sum, m) => sum + m.amount, 0);
  const expected = Math.round((shift.opening_balance + netMovement) * 100) / 100;
  const diff = Math.round((countedAmount - expected) * 100) / 100;
  if (diff !== 0 && !reason?.trim()) {
    throw new Error("لازم تكتب سبب الفرق قبل إقفال الوردية");
  }

  const after: Shift = {
    ...shift,
    status: "closed",
    closing_counted_amount: countedAmount,
    closing_expected_amount: expected,
    closing_diff: diff,
    ...(reason?.trim() && { closing_reason: reason.trim() }),
    closed_by: actorUserId,
    closed_at: new Date().toISOString(),
  };
  writeCollection(
    KEYS.shifts,
    shifts.map((s) => (s.id === shiftId ? after : s)),
  );
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "shift.close",
    entity: "shifts",
    entity_id: shiftId,
    old_value: shift,
    new_value: after,
    ...(reason?.trim() && { reason: reason.trim() }),
  });
  return after;
}

/* ---------------- Expenses (§73) ---------------- */

export function recordExpense(
  accountId: string,
  category: string,
  amount: number,
  reason: string,
  actorUserId: string | null,
): Expense {
  const account = getTreasuryAccounts().find((a) => a.id === accountId);
  if (!account) throw new Error("الخزينة غير موجودة");
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  if (!category.trim()) throw new Error("نوع المصروف مطلوب");
  if (!reason.trim()) throw new Error("سبب المصروف مطلوب");

  const settings = getCurrentTenantSettings();
  const expense: Expense = {
    id: genId("expense"),
    tenant_id: DEMO_TENANT_ID,
    account_id: accountId,
    category: category.trim(),
    amount,
    reason: reason.trim(),
    needs_approval: amount > settings.expense_approval_threshold,
    user_id: actorUserId,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.expenses, [...getExpenses(), expense]);
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "expense.record",
    entity: "expenses",
    entity_id: expense.id,
    new_value: expense,
    reason: expense.reason,
  });

  postTreasuryMovement(
    accountId,
    -amount,
    "expense",
    actorUserId,
    expense.category,
    expense.reason,
  );
  postJournalEntry(
    [
      { account_code: "5000", account_name: ACCOUNT_NAMES["5000"], debit: amount, credit: 0 },
      { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: 0, credit: amount },
    ],
    `مصروف: ${expense.category} — ${expense.reason}`,
    "expense",
    expense.id,
  );

  return expense;
}

/* ---------------- Accounting — simplified Chart of Accounts + Journal Entries (§74/§75) ---------------- */

const ACCOUNT_NAMES: Record<AccountCode, string> = {
  "1000": "الخزينة/النقدية",
  "1100": "عملاء (ذمم مدينة)",
  "1200": "المخزون",
  "2000": "موردون (ذمم دائنة)",
  "3000": "إيرادات المبيعات",
  "3100": "إيرادات التمويل",
  "5000": "المصروفات",
};

function nextJournalEntryNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `JE-${year}-`;
  const count = getJournalEntries().filter((e) => e.entry_number.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

/**
 * The only place a `JournalEntry` is ever created — every caller passes already-balanced lines
 * (debits must equal credits); this just double-checks that invariant before writing so a bug
 * in a caller can never silently corrupt the books.
 */
function postJournalEntry(
  lines: JournalLine[],
  description: string,
  referenceType: string,
  referenceId: string,
): JournalEntry {
  const totalDebit = Math.round(lines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((sum, l) => sum + l.credit, 0) * 100) / 100;
  if (totalDebit !== totalCredit) {
    throw new Error(`قيد غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }
  const entry: JournalEntry = {
    id: genId("je"),
    tenant_id: DEMO_TENANT_ID,
    entry_number: nextJournalEntryNumber(),
    lines,
    description,
    reference_type: referenceType,
    reference_id: referenceId,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.journalEntries, [...getJournalEntries(), entry]);
  return entry;
}

/* ---------------- Returns (§79/§81) — cash sales only in this Mock increment ---------------- */

function nextReturnNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `RET-${year}-`;
  const count = getSaleReturns().filter((r) => r.return_number.startsWith(prefix)).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

export interface CreateReturnInput {
  sale_id: string;
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  reason: string;
}

/**
 * §79/§81 — validates every line before writing anything, same discipline as `createSale`. A
 * returned `serial_required` unit moves to `inspection`, never straight back to `available`;
 * only non-serialized quantity restocks immediately (documented simplification — at this Mock's
 * scale, "Inspection" for loose non-serial stock isn't worth a parallel status system).
 */
export function createReturn(input: CreateReturnInput, actorUserId: string | null): SaleReturn {
  if (input.items.length === 0) throw new Error("لازم تختار صنف واحد على الأقل للإرجاع");
  if (!input.reason.trim()) throw new Error("سبب الإرجاع مطلوب");

  const sale = getSales().find((s) => s.id === input.sale_id);
  if (!sale) throw new Error("الفاتورة غير موجودة");
  if (sale.status === "cancelled") throw new Error("لا يمكن إرجاع فاتورة ملغاة");

  const settings = getCurrentTenantSettings();
  const saleAgeDays = (Date.now() - new Date(sale.created_at).getTime()) / (24 * 60 * 60 * 1000);
  if (saleAgeDays > settings.return_period_days) {
    throw new Error(`انتهت فترة السماح بالإرجاع (${settings.return_period_days} يوم)`);
  }

  const previousReturns = getSaleReturns().filter((r) => r.sale_id === sale.id);
  const products = getProducts();
  const allSerials = getProductSerials();

  const returnItems: ReturnItem[] = [];
  const serialIdsToInspect = new Set<string>();

  for (const line of input.items) {
    const saleLine = sale.items.find(
      (i) =>
        i.product_id === line.product_id &&
        (line.serial_id ? i.serial_id === line.serial_id : !i.serial_id),
    );
    if (!saleLine) throw new Error("الصنف غير موجود في هذه الفاتورة");
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");

    if (product.serial_required) {
      if (line.quantity !== 1 || !line.serial_id) {
        throw new Error(`إرجاع منتج السيريال "${product.name}" لازم سيريال واحد محدد`);
      }
      if (serialIdsToInspect.has(line.serial_id)) {
        throw new Error("نفس السيريال اتكرر في طلب الإرجاع");
      }
      if (previousReturns.some((r) => r.items.some((ri) => ri.serial_id === line.serial_id))) {
        throw new Error(`السيريال "${saleLine.serial_number}" اتُرجع قبل كده`);
      }
      const serial = allSerials.find((s) => s.id === line.serial_id);
      if (!serial || serial.status !== "sold") {
        throw new Error("السيريال مش في حالة تسمح بالإرجاع");
      }
      serialIdsToInspect.add(line.serial_id);
      returnItems.push({
        product_id: product.id,
        product_name: product.name,
        serial_id: serial.id,
        serial_number: serial.serial_number,
        quantity: 1,
        unit_price: saleLine.unit_price,
        line_total: saleLine.unit_price,
      });
    } else {
      const alreadyReturnedQty = previousReturns.reduce(
        (sum, r) =>
          sum +
          r.items
            .filter((ri) => ri.product_id === product.id && !ri.serial_id)
            .reduce((s, ri) => s + ri.quantity, 0),
        0,
      );
      const remaining = saleLine.quantity - alreadyReturnedQty;
      if (line.quantity <= 0 || line.quantity > remaining) {
        throw new Error(
          `كمية إرجاع غير صحيحة للمنتج "${product.name}" (المتاح للإرجاع ${remaining})`,
        );
      }
      returnItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: saleLine.unit_price,
        line_total: Math.round(saleLine.unit_price * line.quantity * 100) / 100,
      });
    }
  }

  const refund_amount =
    Math.round(returnItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
  const return_number = nextReturnNumber();
  const now = new Date().toISOString();

  if (serialIdsToInspect.size > 0) {
    writeCollection(
      KEYS.productSerials,
      allSerials.map((s) =>
        serialIdsToInspect.has(s.id) ? { ...s, status: "inspection" as const } : s,
      ),
    );
  }
  const nonSerialMovements: InventoryMovement[] = returnItems
    .filter((i) => !i.serial_id)
    .map((i) => {
      const product = products.find((p) => p.id === i.product_id)!;
      const before = getProductStock(i.product_id, product);
      return {
        id: genId("mov"),
        tenant_id: DEMO_TENANT_ID,
        product_id: i.product_id,
        type: "return" as const,
        quantity: i.quantity,
        before,
        after: before + i.quantity,
        user_id: actorUserId,
        reference: return_number,
        created_at: now,
      };
    });
  if (nonSerialMovements.length > 0) {
    writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), ...nonSerialMovements]);
  }

  const saleReturn: SaleReturn = {
    id: genId("return"),
    tenant_id: DEMO_TENANT_ID,
    return_number,
    sale_id: sale.id,
    customer_id: sale.customer_id,
    customer_name: sale.customer_name,
    items: returnItems,
    refund_amount,
    reason: input.reason.trim(),
    user_id: actorUserId,
    created_at: now,
  };
  writeCollection(KEYS.saleReturns, [...getSaleReturns(), saleReturn]);

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "sale_return.create",
    entity: "sale_returns",
    entity_id: saleReturn.id,
    new_value: saleReturn,
    reason: saleReturn.reason,
  });

  postTreasuryMovement(CASHIER_ACCOUNT_ID, -refund_amount, "return", actorUserId, return_number);
  postJournalEntry(
    [
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"],
        debit: refund_amount,
        credit: 0,
      },
      {
        account_code: "1000",
        account_name: ACCOUNT_NAMES["1000"],
        debit: 0,
        credit: refund_amount,
      },
    ],
    `مرتجع ${return_number}`,
    "sale_return",
    saleReturn.id,
  );

  return saleReturn;
}

/* ---------------- Exchange (§82) ---------------- */

function nextExchangeNumber(): string {
  const year = new Date().getFullYear();
  const prefix = `EXC-${year}-`;
  const count = getExchangeTransactions().filter((e) =>
    e.exchange_number.startsWith(prefix),
  ).length;
  return `${prefix}${String(count + 1).padStart(6, "0")}`;
}

export interface CreateExchangeInput {
  original_sale_id: string;
  returned_items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  new_items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  reason: string;
}

/**
 * A compound return+sale settled as a single price difference (§82), not two documents. Reuses
 * the same "Inspection not Available" rule for returned serials and the same sold-serial
 * marking for new ones as `createReturn`/`createSale`. Simplification: unlike `createReturn`,
 * this does not cross-check against separate `SaleReturn`/`ExchangeTransaction` history for the
 * same sale line — fine at this Mock's scale; a shared "already processed" ledger is real
 * Phase-with-Supabase work.
 */
export function createExchange(
  input: CreateExchangeInput,
  actorUserId: string | null,
): ExchangeTransaction {
  if (input.returned_items.length === 0) throw new Error("لازم صنف واحد على الأقل للإرجاع");
  if (input.new_items.length === 0) throw new Error("لازم صنف واحد على الأقل للاستبدال به");
  if (!input.reason.trim()) throw new Error("سبب الاستبدال مطلوب");

  const sale = getSales().find((s) => s.id === input.original_sale_id);
  if (!sale) throw new Error("الفاتورة الأصلية غير موجودة");

  const products = getProducts();
  const allSerials = getProductSerials();

  const returnedItems: ReturnItem[] = [];
  const returnedSerialIds = new Set<string>();
  for (const line of input.returned_items) {
    const saleLine = sale.items.find(
      (i) =>
        i.product_id === line.product_id &&
        (line.serial_id ? i.serial_id === line.serial_id : !i.serial_id),
    );
    if (!saleLine) throw new Error("صنف الإرجاع غير موجود في الفاتورة الأصلية");
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");
    if (product.serial_required) {
      if (line.quantity !== 1 || !line.serial_id) {
        throw new Error(`إرجاع "${product.name}" لازم سيريال واحد محدد`);
      }
      const serial = allSerials.find((s) => s.id === line.serial_id);
      if (!serial || serial.status !== "sold") throw new Error("السيريال مش في حالة تسمح بالإرجاع");
      returnedSerialIds.add(serial.id);
      returnedItems.push({
        product_id: product.id,
        product_name: product.name,
        serial_id: serial.id,
        serial_number: serial.serial_number,
        quantity: 1,
        unit_price: saleLine.unit_price,
        line_total: saleLine.unit_price,
      });
    } else {
      if (line.quantity <= 0 || line.quantity > saleLine.quantity) {
        throw new Error(`كمية إرجاع غير صحيحة للمنتج "${product.name}"`);
      }
      returnedItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: saleLine.unit_price,
        line_total: Math.round(saleLine.unit_price * line.quantity * 100) / 100,
      });
    }
  }
  const returnedValue =
    Math.round(returnedItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;

  const newItems: SaleItem[] = [];
  const soldSerialIds = new Set<string>();
  const stockTracker = new Map<string, number>();
  const movementDrafts: Array<{
    product_id: string;
    quantity: number;
    before: number;
    after: number;
  }> = [];
  for (const line of input.new_items) {
    const product = products.find((p) => p.id === line.product_id);
    if (!product) throw new Error("منتج غير موجود");
    if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);
    const currentStock = stockTracker.get(product.id) ?? getProductStock(product.id, product);
    if (product.serial_required) {
      if (line.quantity !== 1 || !line.serial_id) {
        throw new Error(`اختر سيريال للمنتج "${product.name}"`);
      }
      if (soldSerialIds.has(line.serial_id) || returnedSerialIds.has(line.serial_id)) {
        throw new Error("تعارض في اختيار السيريالات");
      }
      const serial = allSerials.find((s) => s.id === line.serial_id && s.product_id === product.id);
      if (!serial || serial.status !== "available") {
        throw new Error(`السيريال غير متاح للمنتج "${product.name}"`);
      }
      soldSerialIds.add(serial.id);
      newItems.push({
        product_id: product.id,
        product_name: product.name,
        serial_id: serial.id,
        serial_number: serial.serial_number,
        quantity: 1,
        unit_price: product.cash_price,
        line_total: product.cash_price,
      });
      stockTracker.set(product.id, currentStock - 1);
      movementDrafts.push({
        product_id: product.id,
        quantity: -1,
        before: currentStock,
        after: currentStock - 1,
      });
    } else {
      if (line.quantity <= 0 || line.quantity > currentStock) {
        throw new Error(`المخزون غير كافٍ للمنتج "${product.name}"`);
      }
      newItems.push({
        product_id: product.id,
        product_name: product.name,
        quantity: line.quantity,
        unit_price: product.cash_price,
        line_total: Math.round(product.cash_price * line.quantity * 100) / 100,
      });
      stockTracker.set(product.id, currentStock - line.quantity);
      movementDrafts.push({
        product_id: product.id,
        quantity: -line.quantity,
        before: currentStock,
        after: currentStock - line.quantity,
      });
    }
  }
  const newValue = Math.round(newItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
  const price_difference = Math.round((newValue - returnedValue) * 100) / 100;
  const exchange_number = nextExchangeNumber();
  const now = new Date().toISOString();

  if (returnedSerialIds.size > 0 || soldSerialIds.size > 0) {
    writeCollection(
      KEYS.productSerials,
      allSerials.map((s) => {
        if (returnedSerialIds.has(s.id)) return { ...s, status: "inspection" as const };
        if (soldSerialIds.has(s.id)) return { ...s, status: "sold" as const };
        return s;
      }),
    );
  }
  const newMovements: InventoryMovement[] = [
    ...returnedItems
      .filter((i) => !i.serial_id)
      .map((i) => {
        const product = products.find((p) => p.id === i.product_id)!;
        const before = getProductStock(i.product_id, product);
        return {
          id: genId("mov"),
          tenant_id: DEMO_TENANT_ID,
          product_id: i.product_id,
          type: "return" as const,
          quantity: i.quantity,
          before,
          after: before + i.quantity,
          user_id: actorUserId,
          reference: exchange_number,
          created_at: now,
        };
      }),
    ...movementDrafts.map((m) => ({
      id: genId("mov"),
      tenant_id: DEMO_TENANT_ID,
      product_id: m.product_id,
      type: "sale" as const,
      quantity: m.quantity,
      before: m.before,
      after: m.after,
      user_id: actorUserId,
      reference: exchange_number,
      created_at: now,
    })),
  ];
  writeCollection(KEYS.inventoryMovements, [...getInventoryMovements(), ...newMovements]);

  const exchange: ExchangeTransaction = {
    id: genId("exchange"),
    tenant_id: DEMO_TENANT_ID,
    exchange_number,
    original_sale_id: sale.id,
    returned_items: returnedItems,
    new_items: newItems,
    price_difference,
    reason: input.reason.trim(),
    user_id: actorUserId,
    created_at: now,
  };
  writeCollection(KEYS.exchangeTransactions, [...getExchangeTransactions(), exchange]);

  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "exchange.create",
    entity: "exchange_transactions",
    entity_id: exchange.id,
    new_value: exchange,
    reason: exchange.reason,
  });

  if (price_difference !== 0) {
    postTreasuryMovement(
      CASHIER_ACCOUNT_ID,
      price_difference,
      "exchange",
      actorUserId,
      exchange_number,
    );
  }
  const journalLines: JournalLine[] = [];
  if (returnedValue > 0) {
    journalLines.push({
      account_code: "3000",
      account_name: ACCOUNT_NAMES["3000"],
      debit: returnedValue,
      credit: 0,
    });
  }
  if (newValue > 0) {
    journalLines.push({
      account_code: "3000",
      account_name: ACCOUNT_NAMES["3000"],
      debit: 0,
      credit: newValue,
    });
  }
  if (price_difference > 0) {
    journalLines.push({
      account_code: "1000",
      account_name: ACCOUNT_NAMES["1000"],
      debit: price_difference,
      credit: 0,
    });
  } else if (price_difference < 0) {
    journalLines.push({
      account_code: "1000",
      account_name: ACCOUNT_NAMES["1000"],
      debit: 0,
      credit: -price_difference,
    });
  }
  postJournalEntry(journalLines, `استبدال ${exchange_number}`, "exchange", exchange.id);

  return exchange;
}

/* ---------------- Delivery Orders (§84) ---------------- */

export function scheduleDelivery(
  saleId: string,
  address: string,
  scheduledDate: string,
  actorUserId: string | null,
): DeliveryOrder {
  const sale = getSales().find((s) => s.id === saleId);
  if (!sale) throw new Error("الفاتورة غير موجودة");
  if (!address.trim()) throw new Error("العنوان مطلوب");
  if (!scheduledDate) throw new Error("تاريخ التوصيل مطلوب");

  const order: DeliveryOrder = {
    id: genId("delivery"),
    tenant_id: DEMO_TENANT_ID,
    sale_id: saleId,
    customer_name: sale.customer_name,
    address: address.trim(),
    scheduled_date: scheduledDate,
    status: "scheduled",
    user_id: actorUserId,
    created_at: new Date().toISOString(),
  };
  writeCollection(KEYS.deliveryOrders, [...getDeliveryOrders(), order]);
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "delivery.schedule",
    entity: "delivery_orders",
    entity_id: order.id,
    new_value: order,
  });
  return order;
}

const DELIVERY_STATUS_ORDER: DeliveryOrder["status"][] = [
  "scheduled",
  "out_for_delivery",
  "delivered",
];

/** §133 rule 11 — delivery is a service tracked separately from the sale's value; this never
 * touches `Sale` or its total. Forward-only state machine, no skipping stages. */
export function advanceDeliveryStatus(
  id: string,
  nextStatus: DeliveryOrder["status"],
  actorUserId: string | null,
): DeliveryOrder {
  const orders = getDeliveryOrders();
  const order = orders.find((o) => o.id === id);
  if (!order) throw new Error("طلب التوصيل غير موجود");
  const currentIndex = DELIVERY_STATUS_ORDER.indexOf(order.status);
  const nextIndex = DELIVERY_STATUS_ORDER.indexOf(nextStatus);
  if (nextIndex !== currentIndex + 1) {
    throw new Error("لا يمكن تخطي مراحل التوصيل");
  }

  const after: DeliveryOrder = {
    ...order,
    status: nextStatus,
    ...(nextStatus === "delivered" && { delivered_at: new Date().toISOString() }),
  };
  writeCollection(
    KEYS.deliveryOrders,
    orders.map((o) => (o.id === id ? after : o)),
  );
  recordAudit({
    tenant_id: DEMO_TENANT_ID,
    user_id: actorUserId,
    action: "delivery.advance",
    entity: "delivery_orders",
    entity_id: id,
    old_value: order,
    new_value: after,
  });
  return after;
}

/* ---------------- Warranty (§86) — read-only, derived, no stored entity ---------------- */

export interface WarrantyInfo {
  product_name: string;
  serial_number: string;
  customer_name: string;
  sold_at: string;
  warranty_months: number;
  warranty_end: string;
  active: boolean;
}

/** Looks across both cash sales and installment contracts for the unit that carries this
 * serial — warranty coverage doesn't depend on how the customer paid. */
export function getWarrantyInfo(serialNumberRaw: string): WarrantyInfo | null {
  const serialNumber = serialNumberRaw.trim().toLowerCase();
  if (!serialNumber) return null;

  const serial = getProductSerials().find((s) => s.serial_number.toLowerCase() === serialNumber);
  if (!serial) return null;
  const product = getProducts().find((p) => p.id === serial.product_id);
  if (!product || !product.warranty_months) return null;

  const cashSale = getSales().find((s) => s.items.some((i) => i.serial_id === serial.id));
  const contract = getInstallmentContracts().find((c) =>
    c.items.some((i) => i.serial_id === serial.id),
  );
  const soldAt = cashSale?.created_at ?? contract?.created_at;
  const customerName = cashSale?.customer_name ?? contract?.customer_name;
  if (!soldAt || !customerName) return null;

  const warrantyEnd = new Date(soldAt);
  warrantyEnd.setMonth(warrantyEnd.getMonth() + product.warranty_months);

  return {
    product_name: product.name,
    serial_number: serial.serial_number,
    customer_name: customerName,
    sold_at: soldAt,
    warranty_months: product.warranty_months,
    warranty_end: warrantyEnd.toISOString(),
    active: new Date() <= warrantyEnd,
  };
}

/* ---------------- Notification Center (§92) — internal-only, derived, no stored entity ---------------- */

export interface AppNotification {
  id: string;
  category:
    "installment_due" | "installment_overdue" | "promise_failed" | "low_stock" | "expense_approval";
  message: string;
  severity: "info" | "warning" | "danger";
}

/**
 * §92 — every notification here is computed fresh from existing collections, never stored;
 * there's no read/unread state either (Mock-stage simplification — a real notification feed
 * needs its own dismissal/read tracking, out of scope until Supabase is connected). §93 — no
 * WhatsApp/SMS provider is wired up; `TenantSettings.whatsapp_notifications_enabled` is purely
 * an architecture placeholder and never causes a message to actually send.
 */
export function getNotifications(): AppNotification[] {
  const settings = getCurrentTenantSettings();
  const notifications: AppNotification[] = [];

  const contracts = getInstallmentContracts().filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
  const allInstallments = getInstallments();
  for (const contract of contracts) {
    const lines = allInstallments.filter(
      (i) => i.contract_id === contract.id && i.status !== "waived" && i.status !== "rescheduled",
    );
    for (const line of lines) {
      const outstanding = Math.max(0, line.amount - line.paid_amount);
      if (outstanding <= 0) continue;
      const effective = getEffectiveInstallmentStatus(line, settings.grace_period_days);
      if (effective === "due") {
        notifications.push({
          id: `inst_due_${line.id}`,
          category: "installment_due",
          message: `قسط مستحق اليوم على عقد ${contract.contract_number} (${contract.customer_name}) بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م`,
          severity: "warning",
        });
      } else if (effective === "overdue") {
        notifications.push({
          id: `inst_overdue_${line.id}`,
          category: "installment_overdue",
          message: `قسط متأخر ${getDaysOverdue(line)} يوم على عقد ${contract.contract_number} (${contract.customer_name}) بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م`,
          severity: "danger",
        });
      }
    }
  }

  const allContracts = getInstallmentContracts();
  for (const promise of getPromisesToPay()) {
    if (getEffectivePromiseStatus(promise) === "failed") {
      const contract = allContracts.find((c) => c.id === promise.contract_id);
      notifications.push({
        id: `promise_failed_${promise.id}`,
        category: "promise_failed",
        message: `وعد بالدفع فشل${contract ? ` على عقد ${contract.contract_number} (${contract.customer_name})` : ""} — كان متوقّع بتاريخ ${new Date(promise.promise_date).toLocaleDateString("ar-EG")}`,
        severity: "danger",
      });
    }
  }

  for (const product of getProducts()) {
    if (!product.active || product.serial_required) continue;
    const stock = getProductStock(product.id, product);
    if (stock < product.min_stock) {
      notifications.push({
        id: `low_stock_${product.id}`,
        category: "low_stock",
        message: `مخزون منخفض: "${product.name}" (${stock} فقط، الحد الأدنى ${product.min_stock})`,
        severity: "warning",
      });
    }
  }

  for (const expense of getExpenses()) {
    if (expense.needs_approval) {
      notifications.push({
        id: `expense_${expense.id}`,
        category: "expense_approval",
        message: `مصروف يحتاج اعتماد: ${expense.category} بمبلغ ${expense.amount.toLocaleString("ar-EG")} ج.م`,
        severity: "info",
      });
    }
  }

  return notifications;
}

/* ----------------------------------------------------------------------------------------
 * Session (Mock — dev-testing aid only)
 *
 * ⚠️ This is NOT Supabase Auth and never will be — it is a throwaway local-testing shim so
 * `/login` has something real to check against before Phase 1 wires up real Supabase Auth +
 * JWT (§8). No hashing, no server-side verification, no RLS. Do not build any real feature
 * on top of this beyond letting a developer click through the app locally.
 * -------------------------------------------------------------------------------------- */

export interface Session {
  user_id: string;
  tenant_id: string;
}

function readSession(): Session | null {
  if (typeof window === "undefined") return null;
  const raw = window.localStorage.getItem(KEYS.session);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as Session;
  } catch {
    return null;
  }
}

export function getSession(): Session | null {
  return readSession();
}

export type SignInResult = { ok: true; session: Session } | { ok: false; error: string };

export function signIn(email: string, password: string): SignInResult {
  const normalizedEmail = email.trim().toLowerCase();
  const user = getUsers().find((u) => u.email.toLowerCase() === normalizedEmail);
  if (!user || !user.active || user.password !== password) {
    return { ok: false, error: "البريد الإلكتروني أو كلمة السر غير صحيحة" };
  }
  const session: Session = { user_id: user.id, tenant_id: user.tenant_id };
  if (typeof window !== "undefined") {
    window.localStorage.setItem(KEYS.session, JSON.stringify(session));
  }
  emit();
  return { ok: true, session };
}

export function signOut(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(KEYS.session);
  emit();
}

/** Dev-only escape hatch — never exposed to Phase-1+ UI; useful for local testing/reset only. */
export function resetData(): void {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((key) => window.localStorage.removeItem(key));
  emit();
}
