import { createServerFn } from "@tanstack/react-start";

import { getSupabaseAdmin } from "@/lib/supabase-admin";
import type { AuditLogEntry, Tenant, TenantStatus } from "@/types";

/** Phase 9 Platform Control Room — the Platform Owner needs to read/write every tenant's
 * `tenants` row, which the anon-key RLS policies (tenants_isolation, current_tenant_id())
 * deliberately do NOT allow: RLS only lets a signed-in user see their own tenant. These three
 * server functions run on the server only and use the service role key
 * (src/lib/supabase-admin.ts) to bypass RLS by design — exactly the pattern documented in
 * supabase/migrations/0001_foundation.sql's own RLS comment. Never expose the service role
 * key itself to the client; only these narrow, purpose-built functions. */

const PLATFORM_TENANT_ID = "00000000-0000-0000-0000-000000000001";

/** §9 — the 8 baseline system roles, duplicated from data-store.ts's private SYSTEM_ROLE_NAMES
 * rather than imported: that file is the client-side Mock module (window/localStorage reads
 * throughout) and has no place in a server-only bundle. This list only changes if the product
 * itself grows a new role, same rare cadence as the Mock copy. */
const SYSTEM_ROLE_NAMES = [
  "owner",
  "manager",
  "sales",
  "cashier",
  "warehouse",
  "purchasing",
  "collections",
  "accountant",
] as const;

function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 8; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export interface ProvisionTenantInput {
  name: string;
  owner_name: string;
  phone: string;
  owner_email: string;
  contact_email?: string;
}

export interface ProvisionTenantResult {
  tenant: Tenant;
  ownerEmail: string;
  ownerPassword: string;
}

/** Real onboarding for a brand-new platform client — replaces the old Mock provisionTenant()
 * (data-store.ts), which only ever wrote to the calling browser's localStorage and could never
 * actually log in anywhere. Creates, in order: a real `tenants` row, its `tenant_settings` row
 * (column defaults already match the Mock's own defaults, so an empty insert is enough), the 8
 * baseline system roles scoped to the new tenant, the "owner" role linked to every existing
 * permission, a REAL Supabase Auth account for the owner (same `auth.admin.createUser` pattern
 * as `createTenantUserWithAuth` in user-provisioning-server.ts), and its `users`/`user_roles`
 * rows. Every table above references `tenants` with `on delete cascade`, so once anything fails
 * after the tenant row exists, deleting that one row unwinds the whole DB side in one shot; the
 * Auth account (a separate system, not a Postgres FK) is cleaned up explicitly when it exists.
 *
 * Unlike most mutations in this app, this one can spin up a brand-new live login on its own —
 * so, alone among this file's functions, it re-checks the caller is a Platform Owner server-side
 * instead of only trusting the calling route's UI-level gate. */
export const provisionTenantServer = createServerFn({ method: "POST" })
  .validator((input: ProvisionTenantInput & { actorUserId: string | null }) => input)
  .handler(async ({ data }): Promise<ProvisionTenantResult> => {
    const supabaseAdmin = getSupabaseAdmin();

    if (!data.actorUserId) throw new Error("لازم تكون مسجّل دخول كمشغّل منصة");
    const { data: actor, error: actorError } = await supabaseAdmin
      .from("users")
      .select("is_platform_owner")
      .eq("id", data.actorUserId)
      .maybeSingle();
    if (actorError || !actor?.["is_platform_owner"]) {
      throw new Error("مسموح فقط لمشغّلي المنصة بإنشاء عميل جديد");
    }

    const name = data.name.trim();
    const ownerName = data.owner_name.trim();
    const phone = data.phone.trim();
    const ownerEmail = data.owner_email.trim().toLowerCase();
    const contactEmail = data.contact_email?.trim();
    if (!name || !ownerName || !phone || !ownerEmail) throw new Error("كل الحقول مطلوبة");

    const now = new Date().toISOString();
    const { data: tenant, error: tenantError } = await supabaseAdmin
      .from("tenants")
      .insert({
        name,
        owner_name: ownerName,
        phone,
        ...(contactEmail && { contact_email: contactEmail }),
        status: "trial",
        plan_id: "plan_trial",
        subscription_start: now,
        subscription_end: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();
    if (tenantError || !tenant) throw new Error(tenantError?.message ?? "تعذّر إنشاء المحل");
    const tenantId = tenant["id"] as string;

    async function unwindTenant() {
      try {
        await supabaseAdmin.from("tenants").delete().eq("id", tenantId);
      } catch {
        /* best-effort cleanup only */
      }
    }

    const { error: settingsError } = await supabaseAdmin
      .from("tenant_settings")
      .insert({ tenant_id: tenantId });
    if (settingsError) {
      await unwindTenant();
      throw new Error(settingsError.message);
    }

    const { data: roleRows, error: rolesError } = await supabaseAdmin
      .from("roles")
      .insert(
        SYSTEM_ROLE_NAMES.map((roleName) => ({
          tenant_id: tenantId,
          name: roleName,
          is_system: true,
        })),
      )
      .select();
    if (rolesError || !roleRows) {
      await unwindTenant();
      throw new Error(rolesError?.message ?? "تعذّر إنشاء الأدوار");
    }
    const ownerRole = roleRows.find((r) => r["name"] === "owner");
    if (!ownerRole) {
      await unwindTenant();
      throw new Error("تعذّر تحديد دور المالك");
    }
    const ownerRoleId = ownerRole["id"] as string;

    const { data: permissionRows, error: permissionsError } = await supabaseAdmin
      .from("permissions")
      .select("id");
    if (permissionsError) {
      await unwindTenant();
      throw new Error(permissionsError.message);
    }
    if (permissionRows && permissionRows.length > 0) {
      const { error: rolePermError } = await supabaseAdmin.from("role_permissions").insert(
        permissionRows.map((p) => ({
          role_id: ownerRoleId,
          permission_id: p["id"] as string,
        })),
      );
      if (rolePermError) {
        await unwindTenant();
        throw new Error(rolePermError.message);
      }
    }

    const ownerPassword = generateTempPassword();
    const { data: created, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: ownerEmail,
      password: ownerPassword,
      email_confirm: true,
      user_metadata: { full_name: ownerName, tenant_id: tenantId },
    });
    if (authError || !created.user) {
      await unwindTenant();
      throw new Error(authError?.message ?? "تعذّر إنشاء حساب دخول المالك");
    }
    const authUserId = created.user.id;

    async function unwindAuth() {
      try {
        await supabaseAdmin.auth.admin.deleteUser(authUserId);
      } catch {
        /* best-effort cleanup only */
      }
    }

    const { data: userRow, error: userError } = await supabaseAdmin
      .from("users")
      .insert({
        tenant_id: tenantId,
        auth_user_id: authUserId,
        full_name: ownerName,
        email: ownerEmail,
        active: true,
      })
      .select()
      .single();
    if (userError || !userRow) {
      await unwindTenant();
      await unwindAuth();
      throw new Error(userError?.message ?? "تعذّر إنشاء حساب المالك");
    }

    const { error: userRoleError } = await supabaseAdmin
      .from("user_roles")
      .insert({ user_id: userRow["id"] as string, role_id: ownerRoleId });
    if (userRoleError) {
      await unwindTenant();
      await unwindAuth();
      throw new Error(userRoleError.message);
    }

    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: tenantId,
      user_id: data.actorUserId,
      action: "tenant.provision",
      entity: "tenants",
      entity_id: tenantId,
      new_value: { tenant, owner_email: ownerEmail },
    });

    return { tenant: tenant as Tenant, ownerEmail, ownerPassword };
  });

export const fetchManagedTenants = createServerFn({ method: "GET" }).handler(async () => {
  const supabaseAdmin = getSupabaseAdmin();
  const { data, error } = await supabaseAdmin
    .from("tenants")
    .select("*")
    .neq("id", PLATFORM_TENANT_ID)
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as Tenant[];
});

export const setTenantStatusServer = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tenantId: string;
      status: TenantStatus;
      actorUserId: string | null;
      reason: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: before, error: fetchError } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", data.tenantId)
      .single();
    if (fetchError || !before) throw new Error(fetchError?.message ?? "المحل غير موجود");
    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({ status: data.status })
      .eq("id", data.tenantId);
    if (updateError) throw new Error(updateError.message);
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenantId,
      user_id: data.actorUserId,
      action: "tenant.status_change",
      entity: "tenants",
      entity_id: data.tenantId,
      old_value: before,
      new_value: { ...before, status: data.status },
      reason: data.reason,
    });
  });

export const extendTenantSubscriptionServer = createServerFn({ method: "POST" })
  .validator((input: { tenantId: string; days: number; actorUserId: string | null }) => input)
  .handler(async ({ data }) => {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: before, error: fetchError } = await supabaseAdmin
      .from("tenants")
      .select("*")
      .eq("id", data.tenantId)
      .single();
    if (fetchError || !before) throw new Error(fetchError?.message ?? "المحل غير موجود");
    const currentEnd = new Date(before["subscription_end"] as string);
    const base = currentEnd.getTime() > Date.now() ? currentEnd : new Date();
    const newEnd = new Date(base.getTime() + data.days * 24 * 60 * 60 * 1000);
    const { error: updateError } = await supabaseAdmin
      .from("tenants")
      .update({ subscription_end: newEnd.toISOString() })
      .eq("id", data.tenantId);
    if (updateError) throw new Error(updateError.message);
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenantId,
      user_id: data.actorUserId,
      action: "tenant.subscription_extend",
      entity: "tenants",
      entity_id: data.tenantId,
      old_value: { subscription_end: before["subscription_end"] },
      new_value: { subscription_end: newEnd.toISOString() },
      reason: `تمديد ${data.days} يوم`,
    });
  });

/** Phase 9 Support Access: the reason goes into the TARGET tenant's own audit log, not the
 * platform's — the anon-key RLS insert policy (audit_logs_insert) would block a Platform
 * Owner writing into a tenant that isn't their own, so this needs the service role too. */
export const recordCrossTenantAudit = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tenantId: string;
      userId: string | null;
      action: string;
      entity: string;
      entityId: string | null;
      reason: string;
    }) => input,
  )
  .handler(async ({ data }) => {
    const supabaseAdmin = getSupabaseAdmin();
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenantId,
      user_id: data.userId,
      action: data.action,
      entity: data.entity,
      entity_id: data.entityId,
      reason: data.reason,
    });
    if (error) throw new Error(error.message);
  });

/** Support Access's read-only summary page needs this one tenant's access log, filtered to
 * `support_access.use` entries only — same service-role reasoning as above, this time for a
 * cross-tenant read instead of a write. Selects columns explicitly (excludes `old_value`/
 * `new_value`, both `unknown` on `AuditLogEntry`) — a server function's return value must be
 * JSON-serializable, which `unknown` isn't, and the UI here only needs date/reason anyway. */
export type TenantAuditLogRow = Omit<AuditLogEntry, "old_value" | "new_value">;

export const fetchTenantAuditLog = createServerFn({ method: "GET" })
  .validator((input: { tenantId: string; action?: string; limit?: number }) => input)
  .handler(async ({ data }): Promise<TenantAuditLogRow[]> => {
    const supabaseAdmin = getSupabaseAdmin();
    let query = supabaseAdmin
      .from("audit_logs")
      .select("id, tenant_id, user_id, action, entity, entity_id, reason, created_at")
      .eq("tenant_id", data.tenantId)
      .order("created_at", { ascending: false })
      .limit(data.limit ?? 50);
    if (data.action) query = query.eq("action", data.action);
    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    return (rows ?? []) as TenantAuditLogRow[];
  });

/** Support Access's read-only summary — same service-role reasoning as above: counting another
 * tenant's customers/products/sales/contracts/installments/treasury is a cross-tenant read the
 * anon-key RLS policies never allow, so it has to run here. Head-count queries (`count: "exact",
 * head: true`) instead of fetching full rows — the page only needs totals. */
export interface TenantSummary {
  ownerEmail: string | null;
  customersCount: number;
  productsCount: number;
  salesCount: number;
  activeContractsCount: number;
  overdueInstallmentsCount: number;
  treasuryBalance: number;
}

export const fetchTenantSummary = createServerFn({ method: "GET" })
  .validator((input: { tenantId: string }) => input)
  .handler(async ({ data }): Promise<TenantSummary> => {
    const supabaseAdmin = getSupabaseAdmin();
    const tenantId = data.tenantId;

    const [
      { data: owner },
      { count: customersCount },
      { count: productsCount },
      { count: salesCount },
      { count: activeContractsCount },
      { count: overdueInstallmentsCount },
      { data: movements },
    ] = await Promise.all([
      supabaseAdmin
        .from("users")
        .select("email")
        .eq("tenant_id", tenantId)
        .eq("is_platform_owner", false)
        .limit(1)
        .maybeSingle(),
      supabaseAdmin
        .from("customers")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("products")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("sales")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId),
      supabaseAdmin
        .from("installment_contracts")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .in("status", ["active", "partially_paid"]),
      supabaseAdmin
        .from("installments")
        .select("*", { count: "exact", head: true })
        .eq("tenant_id", tenantId)
        .eq("status", "overdue"),
      supabaseAdmin.from("treasury_movements").select("amount").eq("tenant_id", tenantId),
    ]);

    const treasuryBalance =
      Math.round((movements ?? []).reduce((sum, m) => sum + (m.amount as number), 0) * 100) / 100;

    return {
      ownerEmail: (owner?.email as string | undefined) ?? null,
      customersCount: customersCount ?? 0,
      productsCount: productsCount ?? 0,
      salesCount: salesCount ?? 0,
      activeContractsCount: activeContractsCount ?? 0,
      overdueInstallmentsCount: overdueInstallmentsCount ?? 0,
      treasuryBalance,
    };
  });

export interface TenantStorageUsage {
  tenantId: string;
  bytes: number;
  formatted: string;
}

/** MB→GB display, always at least kilobyte precision so a near-empty new tenant doesn't just
 * read "0" the moment it's created. */
function formatStorageBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} بايت`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} كيلوبايت`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} ميجابايت`;
  return `${(mb / 1024).toFixed(2)} جيجابايت`;
}

/** Real per-tenant storage usage — calls migration 0017's `platform_tenant_storage_bytes` SQL
 * function, which sums `pg_column_size` across every row of every table with a `tenant_id`
 * column (discovered dynamically, not a hardcoded list here). Omitting `tenantId` returns every
 * tenant in one pass — used by the control room's tenant list; passing one filters to a single
 * tenant — used by the support/monitoring detail page. That SQL function's execute privilege is
 * revoked from the anon/authenticated Postgres roles (migration 0017), so this can only ever
 * work through the service-role client here, never from the browser. */
export const fetchTenantStorageUsage = createServerFn({ method: "GET" })
  .validator((input: { tenantId?: string }) => input)
  .handler(async ({ data }): Promise<TenantStorageUsage[]> => {
    const supabaseAdmin = getSupabaseAdmin();
    const { data: rows, error } = await supabaseAdmin.rpc("platform_tenant_storage_bytes", {
      p_tenant_id: data.tenantId ?? null,
    });
    if (error) throw new Error(error.message);
    return ((rows ?? []) as Array<{ tenant_id: string; bytes: number }>).map((row) => {
      const bytes = Number(row.bytes ?? 0);
      return { tenantId: row.tenant_id, bytes, formatted: formatStorageBytes(bytes) };
    });
  });
