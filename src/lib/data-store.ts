import type {
  AuditLogEntry,
  Permission,
  Role,
  RolePermission,
  SystemRoleName,
  Tenant,
  TenantSettings,
  User,
  UserRoleAssignment,
} from "@/types";

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
  return [{ tenant_id: DEMO_TENANT_ID, currency: "EGP", timezone: "Africa/Cairo" }];
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

/* ---------------- Reads ---------------- */

export function getTenants(): Tenant[] {
  return readCollection(KEYS.tenants, seedTenants);
}

export function getTenantSettings(): TenantSettings[] {
  return readCollection(KEYS.tenantSettings, seedTenantSettings);
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

/** Dev-only escape hatch — never exposed to Phase-1+ UI; useful for local testing/reset only. */
export function resetData(): void {
  if (typeof window === "undefined") return;
  Object.values(KEYS).forEach((key) => window.localStorage.removeItem(key));
  emit();
}
