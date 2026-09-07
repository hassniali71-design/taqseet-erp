import type {
  AuditLogEntry,
  Customer,
  Guarantor,
  Installment,
  InstallmentContract,
  InstallmentPayment,
  InstallmentPlan,
  InstallmentStatus,
  InventoryMovement,
  Permission,
  PromiseToPay,
  Product,
  ProductSerial,
  RestructureEvent,
  Role,
  RolePermission,
  Sale,
  SaleItem,
  SystemRoleName,
  Tenant,
  TenantSettings,
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

  return contract;
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
