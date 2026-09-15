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
