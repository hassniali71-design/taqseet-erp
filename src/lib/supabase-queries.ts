import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { calculateFinance, generateSchedule } from "@/lib/finance-engine";
import {
  getEffectiveInstallmentStatus,
  getEffectivePromiseStatus,
  RISK_LEVEL_LABEL_AR,
} from "@/lib/data-store";
import type { CustomerRiskAssessment } from "@/lib/data-store";
import { supabase } from "@/lib/supabase-client";
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
  InventoryMovement,
  JournalEntry,
  JournalLine,
  Partner,
  PartnerTransaction,
  Product,
  ProductBrand,
  ProductCategory,
  ProductSerial,
  PromiseToPay,
  Purchase,
  PurchaseItem,
  RestructureEvent,
  ReturnItem,
  Role,
  Sale,
  SaleItem,
  SaleReturn,
  Shift,
  Supplier,
  SupplierPayment,
  Tenant,
  TenantSettings,
  TreasuryAccount,
  TreasuryMovement,
  User,
  UserRoleAssignment,
} from "@/types";

/** Tenant-scoped reads/writes for the Foundation layer, going straight through the browser
 * Supabase client (anon key) — Row Level Security (supabase/migrations/0001_foundation.sql)
 * is what actually restricts these to the signed-in user's own tenant, not application code.
 * Cross-tenant reads/writes (the Platform Control Room) go through src/lib/platform-server.ts
 * instead, which uses the service role key from a server function. */

/** يحوّل قيمة `&lt;input type="date"&gt;` (`YYYY-MM-DD`) لـtimestamp كامل صالح لعمود `created_at` —
 * بيحتفظ بتوقيت اليوم الحالي (UTC) على نفس التاريخ المُختار، عشان عمليات باكديت متعددة في نفس
 * اليوم يفضل ترتيبها منطقي، وميتلخبطش بفروق المنطقة الزمنية عند منتصف الليل. مُستخدمة لتفعيل
 * "تاريخ مفتوح" على العميل/البيع/عقد التقسيط/الشراء — انظر تعليق `createdAt` بكل دالة. */
export function dateInputToTimestamp(dateStr: string): string {
  const now = new Date();
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(
    Date.UTC(
      y as number,
      (m as number) - 1,
      d as number,
      now.getUTCHours(),
      now.getUTCMinutes(),
      now.getUTCSeconds(),
    ),
  ).toISOString();
}

export function useCurrentTenant(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenants")
        .select("*")
        .eq("id", tenantId as string)
        .single();
      if (error) throw new Error(error.message);
      return data as Tenant;
    },
    enabled: Boolean(tenantId),
  });
}

export function useCurrentTenantSettings(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["tenant-settings", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tenant_settings")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .single();
      if (error) throw new Error(error.message);
      return data as TenantSettings;
    },
    enabled: Boolean(tenantId),
  });
}

export function useUpdateTenantSettings(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: Partial<Omit<TenantSettings, "tenant_id">>) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error } = await supabase
        .from("tenant_settings")
        .update(patch)
        .eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["tenant-settings", tenantId] });
    },
  });
}

export function useAuditLogs(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["audit-logs", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .eq("tenant_id", tenantId as string)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw new Error(error.message);
      return (data ?? []) as AuditLogEntry[];
    },
    enabled: Boolean(tenantId),
  });
}

/** The audit trail has no UPDATE/DELETE RLS policy by design (supabase/migrations/0001) —
 * these two require supabase/migrations/0013_audit_log_delete.sql to be applied first, which
 * adds a narrow owner-gated delete policy. Both are only ever reachable behind the UI's
 * owner-password re-confirmation, on top of that DB-level gate. */
export function useDeleteAuditLog(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("audit_logs").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useDeleteAllAuditLogs(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error } = await supabase.from("audit_logs").delete().eq("tenant_id", tenantId);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Users & Roles (§8-§11) ----------------
 * Creating a user here only ever writes the `users` table row — it deliberately does NOT create
 * a real Supabase Auth account (that stays out of scope for this batch, same call already made
 * for /platform's tenant provisioning). The created row has no `auth_user_id` and can't sign in
 * for real yet; only an admin manually linking it in Supabase Auth (or a future dedicated step)
 * turns it into a working login, exactly like the Foundation layer's two seeded accounts. */

export function useUsers(tenantId: string | undefined) {
  return useTenantList<User>("users", tenantId, { orderBy: "created_at", ascending: true });
}

export function useRoles(tenantId: string | undefined) {
  return useTenantList<Role>("roles", tenantId, { orderBy: "name", ascending: true });
}

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

/** No real Supabase tenant has ever had its `roles` table seeded — the 8 baseline system
 * roles (§9) only ever existed in the dead Mock `data-store.ts` path. Called once from
 * `/users` whenever `roles` comes back empty, so the role dropdown there (and therefore real
 * employee-login creation) has something to assign instead of silently having nothing to
 * pick from. Safe to call more than once: `roles` has a `unique (tenant_id, name)` constraint,
 * so a second call for a tenant that already has them is a no-op per row. */
export function useSeedSystemRoles(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error } = await supabase.from("roles").upsert(
        SYSTEM_ROLE_NAMES.map((name) => ({ tenant_id: tenantId, name, is_system: true })),
        { onConflict: "tenant_id,name", ignoreDuplicates: true },
      );
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["roles", tenantId] });
    },
  });
}

/** user_roles has no tenant_id column — RLS (joined through users.tenant_id) is what actually
 * restricts this to the signed-in tenant, so this reads the whole table unfiltered. */
export function useUserRoles(tenantId: string | undefined) {
  return useQuery({
    queryKey: ["user_roles", tenantId],
    queryFn: async () => {
      const { data, error } = await supabase.from("user_roles").select("*");
      if (error) throw new Error(error.message);
      return (data ?? []) as UserRoleAssignment[];
    },
    enabled: Boolean(tenantId),
  });
}

export interface CreateUserInput {
  full_name: string;
  email: string;
  roleId?: string;
}

export function useCreateUserRecord(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
    }: {
      input: CreateUserInput;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (!input.full_name.trim()) throw new Error("الاسم مطلوب");
      if (!input.email.trim()) throw new Error("البريد الإلكتروني مطلوب");

      const { data: user, error } = await supabase
        .from("users")
        .insert({
          tenant_id: tenantId,
          full_name: input.full_name.trim(),
          email: input.email.trim(),
          active: true,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);

      if (input.roleId) {
        const { error: roleError } = await supabase
          .from("user_roles")
          .insert({ user_id: user.id as string, role_id: input.roleId });
        if (roleError) throw new Error(roleError.message);
      }

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "user.create",
        entity: "users",
        entity_id: user.id as string,
        new_value: user,
      });
      return user as User;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["user_roles", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetUserRole(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      roleId,
      actorUserId,
    }: {
      userId: string;
      roleId: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error: deleteError } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", userId);
      if (deleteError) throw new Error(deleteError.message);
      const { error: insertError } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, role_id: roleId });
      if (insertError) throw new Error(insertError.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "user_role.set",
        entity: "user_roles",
        entity_id: userId,
        new_value: { user_id: userId, role_id: roleId },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["user_roles", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetUserActive(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      active,
      actorUserId,
    }: {
      userId: string;
      active: boolean;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("users")
        .select("active")
        .eq("id", userId)
        .single();
      if (beforeError || !before) throw new Error("المستخدم غير موجود");
      const { error } = await supabase.from("users").update({ active }).eq("id", userId);
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "user.status_change",
        entity: "users",
        entity_id: userId,
        old_value: { active: before.active },
        new_value: { active },
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* =========================================================================================
 * Business-data layer (Customers/Products/Categories/Brands) — same tenant-scoped anon-key
 * pattern as above, extended past the Foundation layer per the user's decision to prioritize
 * real-Supabase coverage over Mock breadth. A shared `useTenantList`/`insertAuditLog` pair
 * keeps every entity's hooks short instead of repeating the same query/mutation shape by hand.
 * `data-store.ts`'s equivalent Mock functions (createCustomer, createProduct, ...) are left
 * untouched — this is a parallel real data source for the route files that opt into it, not a
 * replacement of the Mock functions in place (same reasoning as the Foundation layer).
 * ========================================================================================= */

function useTenantList<T>(
  table: string,
  tenantId: string | undefined,
  opts?: { orderBy?: string; ascending?: boolean },
) {
  return useQuery({
    queryKey: [table, tenantId],
    queryFn: async () => {
      let query = supabase
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId as string);
      if (opts?.orderBy) query = query.order(opts.orderBy, { ascending: opts.ascending ?? true });
      const { data, error } = await query;
      if (error) throw new Error(error.message);
      return (data ?? []) as T[];
    },
    enabled: Boolean(tenantId),
  });
}

/** Audit insert failures never block the mutation they describe from succeeding — the write
 * to the real business table already happened by the time this runs, and losing an audit
 * line is far better than telling the user their sale/customer/product save failed when it
 * didn't. Logged to console instead so it's still visible during testing. */
async function insertAuditLog(entry: {
  tenant_id: string;
  user_id: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  old_value?: unknown;
  new_value?: unknown;
  reason?: string;
}) {
  const { error } = await supabase.from("audit_logs").insert(entry);
  if (error) console.warn(`audit log insert failed (${entry.action}):`, error.message);
}

async function nextTenantCode(table: string, tenantId: string, prefix: string) {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

/** `nextTenantCode` counts rows then inserts in two separate round trips — two concurrent
 * creates (two tabs, a double-click before the button disables, two cashiers) can both read the
 * same count and collide on the same generated code, hitting the table's `unique(tenant_id, code)`
 * constraint with a raw Postgres error surfaced straight to the user. This wraps that
 * count-then-insert in a bounded retry: on a unique-violation (23505) it just regenerates the
 * code (now one higher, since the other row has committed) and retries the insert — used by every
 * `useCreate*` mutation that calls `nextTenantCode` (customers, products, suppliers, partners). */
async function insertWithGeneratedCode<T>(
  table: string,
  tenantId: string,
  prefix: string,
  buildRow: (code: string) => Record<string, unknown>,
): Promise<T> {
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const code = await nextTenantCode(table, tenantId, prefix);
    const { data, error } = await supabase.from(table).insert(buildRow(code)).select().single();
    if (!error) return data as T;
    if (error.code !== "23505" || attempt === maxAttempts) throw new Error(error.message);
  }
  throw new Error("تعذّر إنشاء كود فريد بعد عدة محاولات — حاول تاني");
}

/* ---------------- Customers (§14) ---------------- */

export function useCustomers(tenantId: string | undefined) {
  return useTenantList<Customer>("customers", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useCreateCustomer(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      createdAt,
    }: {
      input: Omit<Customer, "id" | "tenant_id" | "code" | "status" | "created_at">;
      actorUserId: string | null;
      /** تاريخ مفتوح اختياري — لو العميل قديم فعليًا، بيحدّد `created_at` نفسه بدل "الآن". */
      createdAt?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const data = await insertWithGeneratedCode<Customer>(
        "customers",
        tenantId,
        "CUST",
        (code) => ({
          ...input,
          tenant_id: tenantId,
          code,
          status: "active",
          ...(createdAt ? { created_at: createdAt } : {}),
        }),
      );
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "customer.create",
        entity: "customers",
        entity_id: data.id as string,
        new_value: data,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useUpdateCustomer(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      actorUserId,
    }: {
      id: string;
      patch: Partial<Omit<Customer, "id" | "tenant_id" | "code" | "created_at">>;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("customers")
        .select("*")
        .eq("id", id)
        .single();
      if (beforeError || !before) throw new Error(beforeError?.message ?? "العميل غير موجود");
      const { data, error } = await supabase
        .from("customers")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "customer.update",
        entity: "customers",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as Customer;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** Real permanent delete — gated by owner-password re-confirmation in the UI. Past sales
 * (`sales.customer_id` is `on delete set null`) keep their amounts/items untouched, just
 * unlinked from this customer. `installment_contracts.customer_id` is `on delete restrict`,
 * so Postgres itself refuses the delete while any contract (open or settled) still
 * references this customer — surfaced here as a clear Arabic message instead of a raw
 * Postgres error, since that's the "don't break business history" guarantee in practice. */
export function useDeleteCustomer(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actorUserId }: { id: string; actorUserId: string | null }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase.from("customers").select("*").eq("id", id).single();
      const { error } = await supabase.from("customers").delete().eq("id", id);
      if (error) {
        if (error.code === "23503") {
          throw new Error(
            "لا يمكن حذف هذا العميل نهائيًا لأن له عقود تقسيط مرتبطة (حتى لو مسدَّدة) — استخدم زر إيقاف بدلاً من الحذف.",
          );
        }
        throw new Error(error.message);
      }
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "customer.delete",
        entity: "customers",
        entity_id: id,
        old_value: before,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["customers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Guarantors (§15) ---------------- */

export function useGuarantors(tenantId: string | undefined) {
  return useTenantList<Guarantor>("guarantors", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useCreateGuarantor(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
    }: {
      input: { customer_id: string; name: string; phone: string; relationship?: string };
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (!input.name.trim()) throw new Error("اسم الضامن مطلوب");
      if (!input.phone.trim()) throw new Error("رقم هاتف الضامن مطلوب");
      const { data, error } = await supabase
        .from("guarantors")
        .insert({
          tenant_id: tenantId,
          customer_id: input.customer_id,
          name: input.name.trim(),
          phone: input.phone.trim(),
          ...(input.relationship?.trim() && { relationship: input.relationship.trim() }),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "guarantor.create",
        entity: "guarantors",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as Guarantor;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guarantors", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** A guarantor is pure contact info (no financial ledger references it), so unlike every
 * business-transaction table in this app it's safe to actually delete rather than deactivate —
 * confirmed against the schema's own RLS policies (guarantors_isolation is `for all`, no
 * insert/select-only restriction) before adding this. */
export function useDeleteGuarantor(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      guarantorId,
      actorUserId,
    }: {
      guarantorId: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { error } = await supabase.from("guarantors").delete().eq("id", guarantorId);
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "guarantor.delete",
        entity: "guarantors",
        entity_id: guarantorId,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["guarantors", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Products (§19) ---------------- */

export function useProducts(tenantId: string | undefined) {
  return useTenantList<Product>("products", tenantId, { orderBy: "created_at", ascending: false });
}

export function useCreateProduct(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
    }: {
      input: Omit<Product, "id" | "tenant_id" | "code" | "active" | "created_at">;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const data = await insertWithGeneratedCode<Product>("products", tenantId, "PRD", (code) => ({
        ...input,
        tenant_id: tenantId,
        code,
        active: true,
      }));
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product.create",
        entity: "products",
        entity_id: data.id as string,
        new_value: data,
      });
      return data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useUpdateProduct(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      actorUserId,
    }: {
      id: string;
      patch: Partial<Omit<Product, "id" | "tenant_id" | "code" | "created_at">>;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("products")
        .select("*")
        .eq("id", id)
        .single();
      if (beforeError || !before) throw new Error(beforeError?.message ?? "المنتج غير موجود");
      const { data, error } = await supabase
        .from("products")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product.update",
        entity: "products",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as Product;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** Real permanent delete — gated by owner-password re-confirmation in the UI. Safe for sale
 * history: `sales.items`/`installment_contracts.items` store product name/price as a frozen
 * JSON snapshot at time of sale (no FK to `products`), so past invoices are untouched. Only
 * `product_serials`/`inventory_movements` cascade-delete with the product (its own stock
 * ledger, not a sale record) — surfaced to the user as an explicit warning before confirming. */
export function useDeleteProduct(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actorUserId }: { id: string; actorUserId: string | null }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase.from("products").select("*").eq("id", id).single();
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product.delete",
        entity: "products",
        entity_id: id,
        old_value: before,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Product categories / brands (§19/§118 addable lists) ---------------- */

export function useProductCategories(tenantId: string | undefined) {
  return useTenantList<ProductCategory>("product_categories", tenantId, { orderBy: "name" });
}

export function useRegisterProductCategory(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, actorUserId }: { name: string; actorUserId: string | null }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const trimmed = name.trim();
      const { data: existing, error: existingError } = await supabase
        .from("product_categories")
        .select("*")
        .eq("tenant_id", tenantId)
        .ilike("name", trimmed);
      if (existingError) throw new Error(existingError.message);
      if (existing && existing.length > 0) return existing[0] as ProductCategory;
      const { data, error } = await supabase
        .from("product_categories")
        .insert({ tenant_id: tenantId, name: trimmed, active: true })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product_category.create",
        entity: "product_categories",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as ProductCategory;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_categories", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetProductCategoryActive(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      active,
      actorUserId,
    }: {
      id: string;
      active: boolean;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase
        .from("product_categories")
        .select("*")
        .eq("id", id)
        .single();
      const { data, error } = await supabase
        .from("product_categories")
        .update({ active })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product_category.update",
        entity: "product_categories",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as ProductCategory;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_categories", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useProductBrands(tenantId: string | undefined) {
  return useTenantList<ProductBrand>("product_brands", tenantId, { orderBy: "name" });
}

export function useRegisterProductBrand(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, actorUserId }: { name: string; actorUserId: string | null }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const trimmed = name.trim();
      const { data: existing, error: existingError } = await supabase
        .from("product_brands")
        .select("*")
        .eq("tenant_id", tenantId)
        .ilike("name", trimmed);
      if (existingError) throw new Error(existingError.message);
      if (existing && existing.length > 0) return existing[0] as ProductBrand;
      const { data, error } = await supabase
        .from("product_brands")
        .insert({ tenant_id: tenantId, name: trimmed, active: true })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product_brand.create",
        entity: "product_brands",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as ProductBrand;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_brands", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetProductBrandActive(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      active,
      actorUserId,
    }: {
      id: string;
      active: boolean;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase
        .from("product_brands")
        .select("*")
        .eq("id", id)
        .single();
      const { data, error } = await supabase
        .from("product_brands")
        .update({ active })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product_brand.update",
        entity: "product_brands",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as ProductBrand;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_brands", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Inventory (§21 Serial lifecycle, §29 Movement ledger, §30 Stock Count) ---------------- */

export function useProductSerials(tenantId: string | undefined) {
  return useTenantList<ProductSerial>("product_serials", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useInventoryMovements(tenantId: string | undefined) {
  return useTenantList<InventoryMovement>("inventory_movements", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

/** Mirrors data-store.ts's getProductStock exactly: serial-tracked products count their
 * `available` serials, everything else sums its movement ledger. */
export function computeProductStock(
  productId: string,
  serialRequired: boolean,
  serials: ProductSerial[],
  movements: InventoryMovement[],
): number {
  if (serialRequired) {
    return serials.filter((s) => s.product_id === productId && s.status === "available").length;
  }
  return movements
    .filter((m) => m.product_id === productId)
    .reduce((sum, m) => sum + m.quantity, 0);
}

/** Shared by useReceiveStock and useCreatePurchase (Goods Receipt) — same function a manual
 * "receive stock" click uses, so serial/ledger behavior can never drift between the two entry
 * points, mirroring data-store.ts's own createPurchase-calls-receiveStock design. */
async function performReceiveStock(
  tenantId: string,
  product: Product,
  quantity: number,
  serialNumbers: string[] | undefined,
  actorUserId: string | null,
  reference: string | undefined,
  createdAt?: string,
): Promise<InventoryMovement> {
  if (quantity <= 0) throw new Error("الكمية يجب أن تكون أكبر من صفر");

  const numbers = (serialNumbers ?? []).map((s) => s.trim()).filter(Boolean);
  if (product.serial_required && numbers.length !== quantity) {
    throw new Error(`أدخل ${quantity} سيريال بالظبط (تم إدخال ${numbers.length})`);
  }

  let before: number;
  if (product.serial_required) {
    const { data: existingSerials, error: existingError } = await supabase
      .from("product_serials")
      .select("id, serial_number")
      .eq("tenant_id", tenantId);
    if (existingError) throw new Error(existingError.message);
    const duplicate = numbers.find((n) =>
      (existingSerials ?? []).some(
        (s) => (s.serial_number as string).toLowerCase() === n.toLowerCase(),
      ),
    );
    if (duplicate) throw new Error(`السيريال "${duplicate}" مسجّل بالفعل`);
    const { count, error: countError } = await supabase
      .from("product_serials")
      .select("*", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("product_id", product.id)
      .eq("status", "available");
    if (countError) throw new Error(countError.message);
    before = count ?? 0;
  } else {
    const { data: movements, error: movementsError } = await supabase
      .from("inventory_movements")
      .select("quantity")
      .eq("tenant_id", tenantId)
      .eq("product_id", product.id);
    if (movementsError) throw new Error(movementsError.message);
    before = (movements ?? []).reduce((sum, m) => sum + (m.quantity as number), 0);
  }
  const after = before + quantity;

  if (product.serial_required) {
    const { error: insertSerialsError } = await supabase.from("product_serials").insert(
      numbers.map((serial_number) => ({
        tenant_id: tenantId,
        product_id: product.id,
        serial_number,
        status: "available",
      })),
    );
    if (insertSerialsError) throw new Error(insertSerialsError.message);
  }

  const { data: movement, error: movementError } = await supabase
    .from("inventory_movements")
    .insert({
      tenant_id: tenantId,
      product_id: product.id,
      type: "receipt",
      quantity,
      before,
      after,
      user_id: actorUserId,
      ...(reference ? { reference } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select()
    .single();
  if (movementError) throw new Error(movementError.message);
  await insertAuditLog({
    tenant_id: tenantId,
    user_id: actorUserId,
    action: "inventory.receive",
    entity: "inventory_movements",
    entity_id: movement.id as string,
    new_value: movement,
  });
  return movement as InventoryMovement;
}

export function useReceiveStock(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      product,
      quantity,
      serialNumbers,
      actorUserId,
      reference,
    }: {
      product: Product;
      quantity: number;
      serialNumbers?: string[] | undefined;
      actorUserId: string | null;
      reference?: string | undefined;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      return performReceiveStock(
        tenantId,
        product,
        quantity,
        serialNumbers,
        actorUserId,
        reference,
      );
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** Mirrors data-store.ts's adjustStock exactly (§30 Stock Count — non-serial products only). */
export function useAdjustStock(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      product,
      actualQuantity,
      reason,
      actorUserId,
    }: {
      product: Product;
      actualQuantity: number;
      reason: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (product.serial_required) throw new Error("منتجات السيريال لا تُجرد بهذه الطريقة");

      const { data: movements, error: movementsError } = await supabase
        .from("inventory_movements")
        .select("quantity")
        .eq("tenant_id", tenantId)
        .eq("product_id", product.id);
      if (movementsError) throw new Error(movementsError.message);
      const before = (movements ?? []).reduce((sum, m) => sum + (m.quantity as number), 0);
      const diff = actualQuantity - before;
      if (diff === 0) return { before, after: before, diff: 0 };
      if (!reason.trim()) throw new Error("لازم تكتب سبب الفرق قبل الحفظ");

      const { data: movement, error: movementError } = await supabase
        .from("inventory_movements")
        .insert({
          tenant_id: tenantId,
          product_id: product.id,
          type: "adjustment",
          quantity: diff,
          before,
          after: actualQuantity,
          user_id: actorUserId,
          reason: reason.trim(),
        })
        .select()
        .single();
      if (movementError) throw new Error(movementError.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "inventory.adjust",
        entity: "inventory_movements",
        entity_id: movement.id as string,
        new_value: movement,
        reason: reason.trim(),
      });
      return { before, after: actualQuantity, diff };
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Sales / Cash Sale (§32, §34) ----------------
 * Not yet converted: Installments (§35+), Returns/Exchanges (§79/§82), and Treasury/Journal
 * postings — a real sale here updates real stock/serials but does NOT touch the (still Mock)
 * cashier balance or accounting entries yet. */

export function useSales(tenantId: string | undefined) {
  return useTenantList<Sale>("sales", tenantId, { orderBy: "created_at", ascending: false });
}

async function nextInvoiceNumber(tenantId: string) {
  const prefix = `INV-${new Date().getFullYear()}-`;
  const { count, error } = await supabase
    .from("sales")
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .ilike("invoice_number", `${prefix}%`);
  if (error) throw new Error(error.message);
  return `${prefix}${String((count ?? 0) + 1).padStart(6, "0")}`;
}

export interface CreateSaleInput {
  customer_id: string | null;
  /** unit_price اختياري — البائع يقدر يغيّر سعر بيع الصنف وقت البيع نفسه (بيتجاهل السعر
   * المسجّل على المنتج)، بدل ما يفضل مقفول على السعر اللي اتسجل وقت إضافة المنتج. */
  items: Array<{ product_id: string; serial_id?: string; quantity: number; unit_price?: number }>;
  discount_pct: number;
  return_window_days?: number;
}

export function useCreateSale(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      employeeDiscountLimitPct,
      createdAt,
    }: {
      input: CreateSaleInput;
      actorUserId: string | null;
      employeeDiscountLimitPct: number;
      /** تاريخ مفتوح اختياري — لبيع قديم بيسجّله العميل دلوقتي بأثر رجعي على التقارير. */
      createdAt?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
      if (input.discount_pct < 0 || input.discount_pct > employeeDiscountLimitPct) {
        throw new Error(`أقصى خصم مسموح بدون اعتماد مدير هو ${employeeDiscountLimitPct}%`);
      }

      const [
        { data: products, error: productsError },
        { data: allSerials, error: serialsError },
        { data: movements, error: movementsError },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("tenant_id", tenantId),
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("tenant_id", tenantId),
      ]);
      if (productsError) throw new Error(productsError.message);
      if (serialsError) throw new Error(serialsError.message);
      if (movementsError) throw new Error(movementsError.message);

      let customer: Customer | null = null;
      if (input.customer_id) {
        const { data: customerRow, error: customerError } = await supabase
          .from("customers")
          .select("*")
          .eq("id", input.customer_id)
          .single();
        if (customerError || !customerRow) throw new Error("العميل غير موجود");
        customer = customerRow as Customer;
      }

      const saleItems: SaleItem[] = [];
      const soldSerialIds = new Set<string>();
      const stockTracker = new Map<string, number>();
      const movementDrafts: Array<{
        product_id: string;
        quantity: number;
        before: number;
        after: number;
      }> = [];

      function currentStock(productId: string, serialRequired: boolean) {
        if (stockTracker.has(productId)) return stockTracker.get(productId) as number;
        return computeProductStock(
          productId,
          serialRequired,
          (allSerials ?? []) as ProductSerial[],
          (movements ?? []) as InventoryMovement[],
        );
      }

      for (const line of input.items) {
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
        if (!product) throw new Error("منتج غير موجود");
        if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);
        const stock = currentStock(product.id, product.serial_required);

        if (product.serial_required) {
          if (line.quantity !== 1) {
            throw new Error(`المنتج "${product.name}" يُباع سيريال واحد لكل سطر`);
          }
          if (!line.serial_id) throw new Error(`اختر سيريال للمنتج "${product.name}"`);
          if (soldSerialIds.has(line.serial_id)) {
            throw new Error("لا يمكن بيع نفس السيريال مرتين في نفس الفاتورة");
          }
          const serial = (allSerials ?? []).find(
            (s) => s.id === line.serial_id && s.product_id === product.id,
          );
          if (!serial) throw new Error("السيريال غير موجود");
          if (serial.status !== "available") {
            throw new Error(`السيريال "${serial.serial_number as string}" غير متاح للبيع`);
          }
          soldSerialIds.add(serial.id as string);
          const unitPrice = line.unit_price ?? product.cash_price;
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: unitPrice,
            line_total: unitPrice,
          });
          stockTracker.set(product.id, stock - 1);
          movementDrafts.push({
            product_id: product.id,
            quantity: -1,
            before: stock,
            after: stock - 1,
          });
        } else {
          if (line.quantity <= 0) throw new Error(`كمية غير صحيحة للمنتج "${product.name}"`);
          if (line.quantity > stock) {
            throw new Error(`المخزون غير كافٍ للمنتج "${product.name}" (متاح ${stock})`);
          }
          const unitPrice = line.unit_price ?? product.cash_price;
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: line.quantity,
            unit_price: unitPrice,
            line_total: unitPrice * line.quantity,
          });
          stockTracker.set(product.id, stock - line.quantity);
          movementDrafts.push({
            product_id: product.id,
            quantity: -line.quantity,
            before: stock,
            after: stock - line.quantity,
          });
        }
      }

      const subtotal = saleItems.reduce((sum, i) => sum + i.line_total, 0);
      const discount_amount = Math.round(subtotal * (input.discount_pct / 100) * 100) / 100;
      const total = Math.round((subtotal - discount_amount) * 100) / 100;
      const invoice_number = await nextInvoiceNumber(tenantId);

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .insert({
          tenant_id: tenantId,
          invoice_number,
          customer_id: input.customer_id,
          customer_name: customer?.name ?? "عميل نقدي",
          items: saleItems,
          subtotal,
          discount_pct: input.discount_pct,
          discount_amount,
          total,
          user_id: actorUserId,
          status: "completed",
          ...(input.return_window_days && { return_window_days: input.return_window_days }),
          ...(createdAt ? { created_at: createdAt } : {}),
        })
        .select()
        .single();
      if (saleError) throw new Error(saleError.message);

      if (soldSerialIds.size > 0) {
        const { error: updateSerialsError } = await supabase
          .from("product_serials")
          .update({ status: "sold" })
          .in("id", Array.from(soldSerialIds));
        if (updateSerialsError) throw new Error(updateSerialsError.message);
      }

      if (movementDrafts.length > 0) {
        const { error: movementsInsertError } = await supabase.from("inventory_movements").insert(
          movementDrafts.map((m) => ({
            tenant_id: tenantId,
            product_id: m.product_id,
            type: "sale",
            quantity: m.quantity,
            before: m.before,
            after: m.after,
            user_id: actorUserId,
            reference: invoice_number,
            ...(createdAt ? { created_at: createdAt } : {}),
          })),
        );
        if (movementsInsertError) throw new Error(movementsInsertError.message);
      }

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "sale.create",
        entity: "sales",
        entity_id: sale.id as string,
        new_value: sale,
      });

      await postFinancials(
        tenantId,
        "cashier",
        "sale",
        total,
        actorUserId,
        invoice_number,
        [
          { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: total, credit: 0 },
          { account_code: "3000", account_name: ACCOUNT_NAMES["3000"], debit: 0, credit: total },
        ],
        `بيع نقدي ${invoice_number}`,
        "sale",
        sale.id as string,
        createdAt,
      );

      return sale as Sale;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Installments (§35-§57 — the product's central feature) ----------------
 * Not yet converted: Treasury/Journal postings (a contract/payment here updates real
 * stock+schedule but does not yet post a cashier movement or accounting entry, same
 * documented gap as the Sales flow above). */

export function useInstallmentPlans(tenantId: string | undefined) {
  return useTenantList<InstallmentPlan>("installment_plans", tenantId, {
    orderBy: "duration_months",
  });
}

export function useCreateInstallmentPlan(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      durationMonths,
      ratePct,
      actorUserId,
      active = true,
    }: {
      durationMonths: number;
      ratePct: number;
      actorUserId: string | null;
      /** false لخطة مخصصة لصفقة واحدة بس (من شاشة بيع التقسيط) — تتسجّل بدون ما تظهر في
       * قائمة الخطط العادية بـ/settings. */
      active?: boolean;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data, error } = await supabase
        .from("installment_plans")
        .insert({
          tenant_id: tenantId,
          duration_months: durationMonths,
          rate_pct: ratePct,
          active,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_plan.create",
        entity: "installment_plans",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as InstallmentPlan;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installment_plans", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetInstallmentPlanActive(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      active,
      actorUserId,
    }: {
      id: string;
      active: boolean;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase
        .from("installment_plans")
        .select("*")
        .eq("id", id)
        .single();
      const { data, error } = await supabase
        .from("installment_plans")
        .update({ active })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_plan.update",
        entity: "installment_plans",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as InstallmentPlan;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installment_plans", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useInstallmentContracts(tenantId: string | undefined) {
  return useTenantList<InstallmentContract>("installment_contracts", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useInstallments(tenantId: string | undefined) {
  return useTenantList<Installment>("installments", tenantId);
}

export function useInstallmentPayments(tenantId: string | undefined) {
  return useTenantList<InstallmentPayment>("installment_payments", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function usePromisesToPay(tenantId: string | undefined) {
  return useTenantList<PromiseToPay>("promises_to_pay", tenantId);
}

export function useRestructureEvents(tenantId: string | undefined) {
  return useTenantList<RestructureEvent>("restructure_events", tenantId);
}

function daysOverdue(dueDate: string): number {
  const diffMs = Date.now() - new Date(dueDate).getTime();
  return Math.max(0, Math.floor(diffMs / (24 * 60 * 60 * 1000)));
}

/** Mirrors data-store.ts's getCustomerExposure exactly — sum of every non-waived
 * outstanding balance across the customer's still-open contracts. */
export function computeCustomerExposure(
  customerId: string,
  contracts: InstallmentContract[],
  installments: Installment[],
): number {
  const relevant = contracts.filter(
    (c) => c.customer_id === customerId && c.status !== "settled" && c.status !== "settled_early",
  );
  return relevant.reduce((sum, contract) => {
    const outstanding = installments
      .filter((i) => i.contract_id === contract.id && i.status !== "waived")
      .reduce((s, i) => s + Math.max(0, i.amount - i.paid_amount), 0);
    return sum + outstanding;
  }, 0);
}

/** Mirrors data-store.ts's isCustomerOnCreditHold exactly. */
export function computeCustomerOnCreditHold(
  customerId: string,
  creditHoldDays: number,
  contracts: InstallmentContract[],
  installments: Installment[],
): boolean {
  const contractIds = new Set(
    contracts.filter((c) => c.customer_id === customerId).map((c) => c.id),
  );
  return installments.some(
    (i) =>
      contractIds.has(i.contract_id) &&
      i.status !== "paid" &&
      i.status !== "waived" &&
      daysOverdue(i.due_date) > creditHoldDays,
  );
}

/** Mirrors data-store.ts's getCustomerRiskAssessment exactly — derived on read from the
 * customer's actual installment history (on-time vs late payments, currently-overdue lines,
 * broken promises to pay), never stored. A customer with no installment history at all is
 * "good" by default (no negative signal yet), not "excellent" (no positive signal either). */
export function computeCustomerRiskAssessment(
  customerId: string,
  contracts: InstallmentContract[],
  installments: Installment[],
  payments: InstallmentPayment[],
  promises: PromiseToPay[],
  gracePeriodDays: number,
): CustomerRiskAssessment {
  const customerContracts = contracts.filter((c) => c.customer_id === customerId);
  if (customerContracts.length === 0) {
    return { level: "good", label: RISK_LEVEL_LABEL_AR.good, reasons: ["لا يوجد سجل تقسيط بعد"] };
  }

  const contractIds = new Set(customerContracts.map((c) => c.id));
  const customerInstallments = installments.filter((i) => contractIds.has(i.contract_id));
  const customerPayments = payments.filter((p) => contractIds.has(p.contract_id));

  let paidOnTime = 0;
  let paidLate = 0;
  let currentlyOverdue = 0;

  for (const installment of customerInstallments) {
    const effective = getEffectiveInstallmentStatus(installment, gracePeriodDays);
    if (effective === "overdue") currentlyOverdue += 1;
    if (installment.status === "paid") {
      const lastPaymentAt = customerPayments
        .filter((p) => p.allocations.some((a) => a.installment_id === installment.id))
        .map((p) => p.created_at)
        .sort()
        .at(-1);
      if (lastPaymentAt && new Date(lastPaymentAt) > new Date(installment.due_date)) {
        paidLate += 1;
      } else {
        paidOnTime += 1;
      }
    }
  }

  const failedPromises = promises.filter(
    (p) => contractIds.has(p.contract_id) && getEffectivePromiseStatus(p) === "failed",
  ).length;

  const reasons: string[] = [];
  let riskPoints = 0;
  if (currentlyOverdue > 0) {
    riskPoints += currentlyOverdue * 3;
    reasons.push(`${currentlyOverdue} قسط متأخر حالياً`);
  }
  if (paidLate > 0) {
    riskPoints += paidLate;
    reasons.push(`${paidLate} قسط دُفع بعد موعده سابقاً`);
  }
  if (failedPromises > 0) {
    riskPoints += failedPromises * 2;
    reasons.push(`${failedPromises} وعد بالدفع لم يُنفَّذ`);
  }
  if (riskPoints === 0) {
    reasons.push(paidOnTime > 0 ? `${paidOnTime} قسط مدفوع في موعده` : "لا يوجد تأخير حتى الآن");
  }

  let level: CustomerRiskAssessment["level"];
  if (riskPoints === 0) level = paidOnTime >= 3 ? "excellent" : "good";
  else if (riskPoints <= 2) level = "good";
  else if (riskPoints <= 5) level = "watch";
  else level = "critical";

  return { level, label: RISK_LEVEL_LABEL_AR[level], reasons };
}

async function nextInstallmentDocNumber(
  table: string,
  column: string,
  tenantId: string,
  prefix: string,
) {
  const yearPrefix = `${prefix}-${new Date().getFullYear()}-`;
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .ilike(column, `${yearPrefix}%`);
  if (error) throw new Error(error.message);
  return `${yearPrefix}${String((count ?? 0) + 1).padStart(6, "0")}`;
}

export interface CreateInstallmentContractInput {
  customer_id: string;
  /** unit_price اختياري — نفس مبدأ البيع النقدي، بيتجاهل installment_price المسجّل على
   * المنتج لو البائع غيّره وقت تسجيل الصفقة. */
  items: Array<{ product_id: string; serial_id?: string; quantity: number; unit_price?: number }>;
  down_payment: number;
  plan_id: string;
}

export function useCreateInstallmentContract(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      minDownPaymentPct,
      createdAt,
    }: {
      input: CreateInstallmentContractInput;
      actorUserId: string | null;
      minDownPaymentPct: number;
      /** تاريخ مفتوح اختياري — لعقد قديم بيسجّله العميل دلوقتي بأثر رجعي على التقارير. جدول
       * الأقساط نفسه بيتحسب بادئًا من التاريخ ده (مش من النهاردة) — أول قسط يستحق بعده بشهر. */
      createdAt?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

      const [
        { data: customerRow, error: customerError },
        { data: planRow, error: planError },
        { data: products, error: productsError },
        { data: allSerials, error: serialsError },
        { data: movements, error: movementsError },
      ] = await Promise.all([
        supabase.from("customers").select("*").eq("id", input.customer_id).single(),
        supabase.from("installment_plans").select("*").eq("id", input.plan_id).single(),
        supabase.from("products").select("*").eq("tenant_id", tenantId),
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("tenant_id", tenantId),
      ]);
      if (customerError || !customerRow) throw new Error("العميل غير موجود");
      if (planError || !planRow) throw new Error("خطة التقسيط غير موجودة");
      if (productsError) throw new Error(productsError.message);
      if (serialsError) throw new Error(serialsError.message);
      if (movementsError) throw new Error(movementsError.message);

      const customer = customerRow as Customer;
      const plan = planRow as InstallmentPlan;
      if (customer.status !== "active") throw new Error("العميل غير نشط");
      if (!plan.active) throw new Error("خطة التقسيط غير مفعّلة");

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
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
        if (!product) throw new Error("منتج غير موجود");
        if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);
        const stock = stockTracker.has(product.id)
          ? (stockTracker.get(product.id) as number)
          : computeProductStock(
              product.id,
              product.serial_required,
              (allSerials ?? []) as ProductSerial[],
              (movements ?? []) as InventoryMovement[],
            );

        if (product.serial_required) {
          if (line.quantity !== 1) {
            throw new Error(`المنتج "${product.name}" يُباع سيريال واحد لكل سطر`);
          }
          if (!line.serial_id) throw new Error(`اختر سيريال للمنتج "${product.name}"`);
          if (soldSerialIds.has(line.serial_id)) {
            throw new Error("لا يمكن بيع نفس السيريال مرتين في نفس العقد");
          }
          const serial = (allSerials ?? []).find(
            (s) => s.id === line.serial_id && s.product_id === product.id,
          );
          if (!serial) throw new Error("السيريال غير موجود");
          if (serial.status !== "available") {
            throw new Error(`السيريال "${serial.serial_number as string}" غير متاح للبيع`);
          }
          soldSerialIds.add(serial.id as string);
          const unitPrice = line.unit_price ?? product.installment_price;
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: unitPrice,
            line_total: unitPrice,
          });
          stockTracker.set(product.id, stock - 1);
          movementDrafts.push({
            product_id: product.id,
            quantity: -1,
            before: stock,
            after: stock - 1,
          });
        } else {
          if (line.quantity <= 0) throw new Error(`كمية غير صحيحة للمنتج "${product.name}"`);
          if (line.quantity > stock) {
            throw new Error(`المخزون غير كافٍ للمنتج "${product.name}" (متاح ${stock})`);
          }
          const unitPrice = line.unit_price ?? product.installment_price;
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: line.quantity,
            unit_price: unitPrice,
            line_total: unitPrice * line.quantity,
          });
          stockTracker.set(product.id, stock - line.quantity);
          movementDrafts.push({
            product_id: product.id,
            quantity: -line.quantity,
            before: stock,
            after: stock - line.quantity,
          });
        }
      }

      const cash_subtotal = saleItems.reduce((sum, i) => sum + i.line_total, 0);
      if (input.down_payment < 0) throw new Error("المقدّم لا يمكن أن يكون سالبًا");
      const minDownPayment = Math.round(cash_subtotal * (minDownPaymentPct / 100) * 100) / 100;
      if (input.down_payment < minDownPayment) {
        throw new Error(
          `الحد الأدنى للمقدّم ${minDownPayment} ج.م (${minDownPaymentPct}% من قيمة البضاعة)`,
        );
      }
      if (input.down_payment >= cash_subtotal) {
        throw new Error("المقدّم يغطي كامل القيمة — استخدم البيع النقدي بدلاً من التقسيط");
      }

      const principal = Math.round((cash_subtotal - input.down_payment) * 100) / 100;
      const { financeAmount, totalAmount } = calculateFinance(principal, plan.rate_pct);

      // جدول الأقساط بيتحسب من تاريخ العقد نفسه (لو اتحدد يدويًا) مش من النهاردة — عقد بتاريخ
      // مفتوح قديم لازم أول قسط فيه يستحق بعد شهر من تاريخه الحقيقي، مش من تاريخ التسجيل.
      const schedule = generateSchedule(
        totalAmount,
        plan.duration_months,
        createdAt ? new Date(createdAt) : undefined,
      );
      const contract_number = await nextInstallmentDocNumber(
        "installment_contracts",
        "contract_number",
        tenantId,
        "CNT",
      );

      const { data: contract, error: contractError } = await supabase
        .from("installment_contracts")
        .insert({
          tenant_id: tenantId,
          contract_number,
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
          ...(createdAt ? { created_at: createdAt } : {}),
        })
        .select()
        .single();
      if (contractError) throw new Error(contractError.message);

      const { error: installmentsInsertError } = await supabase.from("installments").insert(
        schedule.map((line) => ({
          tenant_id: tenantId,
          contract_id: contract.id as string,
          seq: line.seq,
          due_date: line.due_date,
          amount: line.amount,
          paid_amount: 0,
          status: "scheduled",
        })),
      );
      if (installmentsInsertError) throw new Error(installmentsInsertError.message);

      if (soldSerialIds.size > 0) {
        const { error: updateSerialsError } = await supabase
          .from("product_serials")
          .update({ status: "sold" })
          .in("id", Array.from(soldSerialIds));
        if (updateSerialsError) throw new Error(updateSerialsError.message);
      }
      if (movementDrafts.length > 0) {
        const { error: movementsInsertError } = await supabase.from("inventory_movements").insert(
          movementDrafts.map((m) => ({
            tenant_id: tenantId,
            product_id: m.product_id,
            type: "sale",
            quantity: m.quantity,
            before: m.before,
            after: m.after,
            user_id: actorUserId,
            reference: contract_number,
            ...(createdAt ? { created_at: createdAt } : {}),
          })),
        );
        if (movementsInsertError) throw new Error(movementsInsertError.message);
      }

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_contract.create",
        entity: "installment_contracts",
        entity_id: contract.id as string,
        new_value: contract,
      });

      // §75 — Product Profit (cash_subtotal) kept separate from Financing Revenue
      // (finance_amount): Dr Cash (down payment, if any) + Dr Customers (what's still owed)
      // balances against Cr Sales Revenue (goods value) + Cr Financing Revenue.
      try {
        if (input.down_payment > 0) {
          const cashierId = await findAccountIdByKind(tenantId, "cashier");
          if (cashierId) {
            await performPostTreasuryMovement(
              tenantId,
              cashierId,
              input.down_payment,
              "sale",
              actorUserId,
              contract_number,
              undefined,
              createdAt,
            );
          }
        }
        await performPostJournalEntry(
          tenantId,
          [
            ...(input.down_payment > 0
              ? [
                  {
                    account_code: "1000" as const,
                    account_name: ACCOUNT_NAMES["1000"],
                    debit: input.down_payment,
                    credit: 0,
                  },
                ]
              : []),
            {
              account_code: "1100",
              account_name: ACCOUNT_NAMES["1100"],
              debit: totalAmount,
              credit: 0,
            },
            {
              account_code: "3000",
              account_name: ACCOUNT_NAMES["3000"],
              debit: 0,
              credit: cash_subtotal,
            },
            {
              account_code: "3100",
              account_name: ACCOUNT_NAMES["3100"],
              debit: 0,
              credit: financeAmount,
            },
          ],
          `عقد تقسيط ${contract_number}`,
          "installment_contract",
          contract.id as string,
          createdAt,
        );
      } catch (e) {
        console.warn("فشل ترحيل الحركة المالية:", e instanceof Error ? e.message : e);
      }

      return contract as InstallmentContract;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** Shared by useCollectPayment and useEarlySettleContract — same Oldest-Due-First allocation
 * (§46), same receipt/status/promise side effects, just a different caller-supplied amount. */
async function performCollectPayment(
  tenantId: string,
  contractId: string,
  amount: number,
  actorUserId: string | null,
  createdAt?: string,
): Promise<InstallmentPayment> {
  if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
  const { data: contract, error: contractError } = await supabase
    .from("installment_contracts")
    .select("*")
    .eq("id", contractId)
    .single();
  if (contractError || !contract) throw new Error("العقد غير موجود");

  const { data: allInstallments, error: installmentsError } = await supabase
    .from("installments")
    .select("*")
    .eq("contract_id", contractId);
  if (installmentsError) throw new Error(installmentsError.message);
  const contractInstallments = (allInstallments ?? [])
    .filter((i) => i.status !== "waived" && i.status !== "rescheduled")
    .sort((a, b) => (a.seq as number) - (b.seq as number));

  const totalOwed =
    Math.round(
      contractInstallments.reduce(
        (sum, i) => sum + Math.max(0, (i.amount as number) - (i.paid_amount as number)),
        0,
      ) * 100,
    ) / 100;
  if (totalOwed <= 0) throw new Error("لا يوجد أقساط مستحقة على هذا العقد");
  if (amount > totalOwed) {
    throw new Error(`المبلغ (${amount}) أكبر من إجمالي المتبقي على العقد (${totalOwed} ج.م)`);
  }

  let remaining = amount;
  const allocations: Array<{ installment_id: string; amount: number }> = [];
  const updates: Array<{ id: string; paid_amount: number; status: string }> = [];
  for (const inst of contractInstallments) {
    if (remaining <= 0) break;
    const owed = Math.round(((inst.amount as number) - (inst.paid_amount as number)) * 100) / 100;
    if (owed <= 0) continue;
    const apply = Math.min(owed, remaining);
    allocations.push({ installment_id: inst.id as string, amount: apply });
    const newPaid = Math.round(((inst.paid_amount as number) + apply) * 100) / 100;
    updates.push({
      id: inst.id as string,
      paid_amount: newPaid,
      status: newPaid >= (inst.amount as number) ? "paid" : "partially_paid",
    });
    remaining = Math.round((remaining - apply) * 100) / 100;
  }

  const receipt_number = await nextInstallmentDocNumber(
    "installment_payments",
    "receipt_number",
    tenantId,
    "RCT",
  );
  const { data: payment, error: paymentError } = await supabase
    .from("installment_payments")
    .insert({
      tenant_id: tenantId,
      contract_id: contractId,
      receipt_number,
      amount,
      allocations,
      user_id: actorUserId,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select()
    .single();
  if (paymentError) throw new Error(paymentError.message);

  for (const u of updates) {
    const { error: updateError } = await supabase
      .from("installments")
      .update({ paid_amount: u.paid_amount, status: u.status })
      .eq("id", u.id);
    if (updateError) throw new Error(updateError.message);
  }

  const { data: refreshed, error: refreshedError } = await supabase
    .from("installments")
    .select("status, paid_amount")
    .eq("contract_id", contractId)
    .not("status", "in", "(waived,rescheduled)");
  if (refreshedError) throw new Error(refreshedError.message);
  const allPaid = (refreshed ?? []).every((i) => i.status === "paid");
  const anyPaid = (refreshed ?? []).some((i) => (i.paid_amount as number) > 0);
  const nextStatus = allPaid ? "settled" : anyPaid ? "partially_paid" : (contract.status as string);
  if (nextStatus !== contract.status) {
    const { error: statusError } = await supabase
      .from("installment_contracts")
      .update({ status: nextStatus })
      .eq("id", contractId);
    if (statusError) throw new Error(statusError.message);
  }

  const { data: keepablePromises, error: promisesError } = await supabase
    .from("promises_to_pay")
    .select("id, promise_date")
    .eq("contract_id", contractId)
    .eq("status", "pending");
  if (promisesError) throw new Error(promisesError.message);
  const nowIso = new Date().toISOString();
  const keepableIds = (keepablePromises ?? [])
    .filter((p) => nowIso <= (p.promise_date as string))
    .map((p) => p.id as string);
  if (keepableIds.length > 0) {
    const { error: keepError } = await supabase
      .from("promises_to_pay")
      .update({ status: "kept" })
      .in("id", keepableIds);
    if (keepError) throw new Error(keepError.message);
  }

  await insertAuditLog({
    tenant_id: tenantId,
    user_id: actorUserId,
    action: "installment_payment.collect",
    entity: "installment_payments",
    entity_id: payment.id as string,
    new_value: payment,
  });

  await postFinancials(
    tenantId,
    "cashier",
    "collection",
    amount,
    actorUserId,
    payment.receipt_number as string,
    [
      { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: amount, credit: 0 },
      { account_code: "1100", account_name: ACCOUNT_NAMES["1100"], debit: 0, credit: amount },
    ],
    `تحصيل ${payment.receipt_number as string}`,
    "installment_payment",
    payment.id as string,
    createdAt,
  );

  return payment as InstallmentPayment;
}

export function useCollectPayment(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      amount,
      actorUserId,
      createdAt,
    }: {
      contractId: string;
      amount: number;
      actorUserId: string | null;
      /** تاريخ تحصيل مفتوح اختياري — لتحصيلة قديمة بتتسجّل دلوقتي بأثر رجعي. */
      createdAt?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      return performCollectPayment(tenantId, contractId, amount, actorUserId, createdAt);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["promises_to_pay", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useRecordPromise(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      promiseDate,
      expectedAmount,
      notes,
      actorUserId,
    }: {
      contractId: string;
      promiseDate: string;
      expectedAmount: number;
      notes?: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (expectedAmount <= 0) throw new Error("المبلغ المتوقع يجب أن يكون أكبر من صفر");
      const { data, error } = await supabase
        .from("promises_to_pay")
        .insert({
          tenant_id: tenantId,
          contract_id: contractId,
          promise_date: promiseDate,
          expected_amount: expectedAmount,
          ...(notes?.trim() && { notes: notes.trim() }),
          user_id: actorUserId,
          status: "pending",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "promise_to_pay.record",
        entity: "promises_to_pay",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as PromiseToPay;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["promises_to_pay", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useEarlySettleContract(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      actorUserId,
    }: {
      contractId: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: contract, error: contractError } = await supabase
        .from("installment_contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      if (contractError || !contract) throw new Error("العقد غير موجود");
      if (contract.status === "settled" || contract.status === "settled_early") {
        throw new Error("العقد مسدد بالكامل بالفعل");
      }

      const { data: outstanding, error: outstandingError } = await supabase
        .from("installments")
        .select("amount, paid_amount")
        .eq("contract_id", contractId)
        .not("status", "in", "(waived,rescheduled)");
      if (outstandingError) throw new Error(outstandingError.message);
      const remaining =
        Math.round(
          (outstanding ?? []).reduce(
            (sum, i) => sum + Math.max(0, (i.amount as number) - (i.paid_amount as number)),
            0,
          ) * 100,
        ) / 100;
      if (remaining <= 0) throw new Error("لا يوجد مبلغ متبقي لتسويته");

      const payment = await performCollectPayment(tenantId, contractId, remaining, actorUserId);

      const { error: statusError } = await supabase
        .from("installment_contracts")
        .update({ status: "settled_early" })
        .eq("id", contractId);
      if (statusError) throw new Error(statusError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_contract.settle_early",
        entity: "installment_contracts",
        entity_id: contractId,
        new_value: { remaining, payment_id: payment.id },
      });

      return payment;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useRestructureContract(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      newDurationMonths,
      reason,
      actorUserId,
    }: {
      contractId: string;
      newDurationMonths: number;
      reason: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (newDurationMonths <= 0) throw new Error("مدة إعادة الهيكلة يجب أن تكون أكبر من صفر");
      if (!reason.trim()) throw new Error("سبب إعادة الهيكلة مطلوب");

      const { data: contract, error: contractError } = await supabase
        .from("installment_contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      if (contractError || !contract) throw new Error("العقد غير موجود");
      if (contract.status === "settled" || contract.status === "settled_early") {
        throw new Error("العقد مسدد بالكامل، لا يمكن إعادة هيكلته");
      }

      const { data: contractInstallments, error: instError } = await supabase
        .from("installments")
        .select("*")
        .eq("contract_id", contractId);
      if (instError) throw new Error(instError.message);
      const outstanding = (contractInstallments ?? []).filter(
        (i) =>
          i.status !== "waived" &&
          i.status !== "rescheduled" &&
          (i.amount as number) > (i.paid_amount as number),
      );
      if (outstanding.length === 0) throw new Error("لا يوجد أقساط متبقية لإعادة هيكلتها");

      const remaining =
        Math.round(
          outstanding.reduce(
            (sum, i) => sum + ((i.amount as number) - (i.paid_amount as number)),
            0,
          ) * 100,
        ) / 100;
      const oldInstallmentIds = outstanding.map((i) => i.id as string);

      const schedule = generateSchedule(remaining, newDurationMonths);
      const maxSeq = Math.max(0, ...(contractInstallments ?? []).map((i) => i.seq as number));

      const { error: updateOldError } = await supabase
        .from("installments")
        .update({ status: "rescheduled" })
        .in("id", oldInstallmentIds);
      if (updateOldError) throw new Error(updateOldError.message);

      const { error: insertNewError } = await supabase.from("installments").insert(
        schedule.map((line, index) => ({
          tenant_id: tenantId,
          contract_id: contractId,
          seq: maxSeq + index + 1,
          due_date: line.due_date,
          amount: line.amount,
          paid_amount: 0,
          status: "scheduled",
        })),
      );
      if (insertNewError) throw new Error(insertNewError.message);

      const { data: event, error: eventError } = await supabase
        .from("restructure_events")
        .insert({
          tenant_id: tenantId,
          contract_id: contractId,
          old_installment_ids: oldInstallmentIds,
          remaining_amount: remaining,
          new_duration_months: newDurationMonths,
          reason: reason.trim(),
          user_id: actorUserId,
        })
        .select()
        .single();
      if (eventError) throw new Error(eventError.message);

      const { error: statusError } = await supabase
        .from("installment_contracts")
        .update({ status: "restructured" })
        .eq("id", contractId);
      if (statusError) throw new Error(statusError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_contract.restructure",
        entity: "installment_contracts",
        entity_id: contractId,
        new_value: event,
        reason: reason.trim(),
      });

      return event as RestructureEvent;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["restructure_events", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** إلغاء عقد تقسيط بالكامل بالغلط — مسموح بس طالما لسه مفيش أي قسط اتحصّل عليه (لا `active` ولا
 * حاجة اتعدلت زي restructure/settle، وصفر مدفوع في installments.paid_amount) — أنضف سيناريو "زي
 * إنه محصلش"، بقرار المستخدم صراحة بدل التعامل مع رد فلوس حقيقي لعميل دفع أقساط فعلية. بيعكس:
 * السيريال/المخزون (زي مرتجع حقيقي)، الأثر المالي في الخزينة/المحاسبة (صورة معكوسة بالظبط من
 * القيد الأصلي اللي `useCreateInstallmentContract` سجّله)، وأي تسوية شركاء مرتبطة بالعقد ده —
 * بصف `contract_cancellation` موجب/سالب عكسي، مش تعديل أو حذف للصف الأصلي (دفتر الشركاء
 * append-only زي `settlePartnersForDeal` نفسها). زي كل الترحيلات المالية التانية في المشروع،
 * فشل الجزء المالي/تسوية الشركاء best-effort (ميوقفش الإلغاء نفسه)؛ لكن عكس المخزون/السيريال
 * وتغيير حالة العقد إلزاميين (لو فشلوا الإلغاء كله بيفشل، زي useCreateInstallmentContract بالظبط). */
export function useCancelInstallmentContract(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      reason,
      actorUserId,
    }: {
      contractId: string;
      reason: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (!reason.trim()) throw new Error("سبب الإلغاء مطلوب");

      const { data: contract, error: contractError } = await supabase
        .from("installment_contracts")
        .select("*")
        .eq("id", contractId)
        .single();
      if (contractError || !contract) throw new Error("العقد غير موجود");
      if (contract.status !== "active") {
        throw new Error(
          "العقد ده مش في حالة تسمح بالإلغاء الكامل — لازم يكون نشط بدون أي تعديل أو تحصيل عليه",
        );
      }

      const { data: contractInstallments, error: instError } = await supabase
        .from("installments")
        .select("id, paid_amount")
        .eq("contract_id", contractId);
      if (instError) throw new Error(instError.message);
      const totalPaid = (contractInstallments ?? []).reduce(
        (sum, i) => sum + (i.paid_amount as number),
        0,
      );
      if (totalPaid > 0) {
        throw new Error("اتحصّل على العقد ده أقساط بالفعل — الإلغاء الكامل مسموح بس قبل أي تحصيل");
      }

      const [
        { data: allSerials, error: serialsError },
        { data: movements, error: movementsError },
      ] = await Promise.all([
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("tenant_id", tenantId),
      ]);
      if (serialsError) throw new Error(serialsError.message);
      if (movementsError) throw new Error(movementsError.message);

      const items = contract.items as SaleItem[];
      const stockTracker = new Map<string, number>();
      for (const item of items) {
        const stock = stockTracker.has(item.product_id)
          ? (stockTracker.get(item.product_id) as number)
          : computeProductStock(
              item.product_id,
              Boolean(item.serial_id),
              (allSerials ?? []) as ProductSerial[],
              (movements ?? []) as InventoryMovement[],
            );
        const before = stock;
        const after = stock + item.quantity;
        stockTracker.set(item.product_id, after);

        if (item.serial_id) {
          const { error: serialUpdateError } = await supabase
            .from("product_serials")
            .update({ status: "available" })
            .eq("id", item.serial_id);
          if (serialUpdateError) throw new Error(serialUpdateError.message);
        }
        const { error: movementError } = await supabase.from("inventory_movements").insert({
          tenant_id: tenantId,
          product_id: item.product_id,
          type: "return",
          quantity: item.quantity,
          before,
          after,
          user_id: actorUserId,
          reference: contract.contract_number as string,
          reason: `إلغاء عقد تقسيط: ${reason.trim()}`,
        });
        if (movementError) throw new Error(movementError.message);
      }

      const { error: waiveError } = await supabase
        .from("installments")
        .update({ status: "waived" })
        .eq("contract_id", contractId);
      if (waiveError) throw new Error(waiveError.message);

      const { error: statusError } = await supabase
        .from("installment_contracts")
        .update({ status: "cancelled" })
        .eq("id", contractId);
      if (statusError) throw new Error(statusError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "installment_contract.cancel",
        entity: "installment_contracts",
        entity_id: contractId,
        old_value: contract,
        reason: reason.trim(),
      });

      try {
        const downPayment = contract.down_payment as number;
        if (downPayment > 0) {
          const cashierId = await findAccountIdByKind(tenantId, "cashier");
          if (cashierId) {
            await performPostTreasuryMovement(
              tenantId,
              cashierId,
              -downPayment,
              "return",
              actorUserId,
              contract.contract_number as string,
              `إلغاء عقد ${contract.contract_number as string}`,
            );
          }
        }
        await performPostJournalEntry(
          tenantId,
          [
            ...(downPayment > 0
              ? [
                  {
                    account_code: "1000" as const,
                    account_name: ACCOUNT_NAMES["1000"],
                    debit: 0,
                    credit: downPayment,
                  },
                ]
              : []),
            {
              account_code: "1100",
              account_name: ACCOUNT_NAMES["1100"],
              debit: 0,
              credit: contract.total_amount as number,
            },
            {
              account_code: "3000",
              account_name: ACCOUNT_NAMES["3000"],
              debit: contract.cash_subtotal as number,
              credit: 0,
            },
            {
              account_code: "3100",
              account_name: ACCOUNT_NAMES["3100"],
              debit: contract.finance_amount as number,
              credit: 0,
            },
          ],
          `إلغاء عقد تقسيط ${contract.contract_number as string}`,
          "installment_contract_cancellation",
          contractId,
        );
      } catch (e) {
        console.warn(
          "فشل ترحيل عكس الحركة المالية للعقد الملغى:",
          e instanceof Error ? e.message : e,
        );
      }

      try {
        const { data: settlements, error: settlementsError } = await supabase
          .from("partner_transactions")
          .select("*")
          .eq("related_contract_id", contractId)
          .eq("type", "sale_settlement");
        if (settlementsError) throw new Error(settlementsError.message);
        if (settlements && settlements.length > 0) {
          const { error: reversalError } = await supabase.from("partner_transactions").insert(
            settlements.map((s) => ({
              tenant_id: tenantId,
              partner_id: s.partner_id as string,
              type: "contract_cancellation",
              amount: -(s.profit_amount as number),
              cost_recovered: -(s.cost_recovered as number),
              profit_amount: -(s.profit_amount as number),
              reference: contract.contract_number as string,
              reason: `إلغاء عقد تقسيط — عكس تسوية سابقة: ${reason.trim()}`,
              related_contract_id: contractId,
              ...(s.related_product_id
                ? { related_product_id: s.related_product_id as string }
                : {}),
              user_id: actorUserId,
            })),
          );
          if (reversalError) throw new Error(reversalError.message);
        }
      } catch (e) {
        console.warn("فشل عكس تسوية الشركاء للعقد الملغى:", e instanceof Error ? e.message : e);
      }

      return contract as InstallmentContract;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["partner_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Suppliers / Purchasing (§60-§65) ----------------
 * Not yet converted: Treasury/Journal postings — a purchase here updates real stock+cost but
 * does not yet post a payable to the (still Mock) accounting ledger, same documented gap as
 * Sales/Installments. */

export function useSuppliers(tenantId: string | undefined) {
  return useTenantList<Supplier>("suppliers", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useCreateSupplier(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
    }: {
      input: Omit<Supplier, "id" | "tenant_id" | "code" | "active" | "created_at">;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const data = await insertWithGeneratedCode<Supplier>(
        "suppliers",
        tenantId,
        "SUP",
        (code) => ({
          ...input,
          tenant_id: tenantId,
          code,
          active: true,
        }),
      );
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "supplier.create",
        entity: "suppliers",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as Supplier;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useUpdateSupplier(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      actorUserId,
    }: {
      id: string;
      patch: Partial<Omit<Supplier, "id" | "tenant_id" | "code" | "created_at">>;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", id)
        .single();
      if (beforeError || !before) throw new Error(beforeError?.message ?? "المورد غير موجود");
      const { data, error } = await supabase
        .from("suppliers")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "supplier.update",
        entity: "suppliers",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as Supplier;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["suppliers", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function usePurchases(tenantId: string | undefined) {
  return useTenantList<Purchase>("purchases", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useSupplierPayments(tenantId: string | undefined) {
  return useTenantList<SupplierPayment>("supplier_payments", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

/** Mirrors data-store.ts's getSupplierBalance exactly. */
export function computeSupplierBalance(
  supplierId: string,
  purchases: Purchase[],
  payments: SupplierPayment[],
): number {
  const totalPurchased = purchases
    .filter((p) => p.supplier_id === supplierId)
    .reduce((sum, p) => sum + p.total, 0);
  const totalPaid = payments
    .filter((p) => p.supplier_id === supplierId)
    .reduce((sum, p) => sum + p.amount, 0);
  return Math.round((totalPurchased - totalPaid) * 100) / 100;
}

export interface CreatePurchaseInput {
  supplier_id: string;
  items: Array<{
    product_id: string;
    quantity: number;
    unit_cost: number;
    serial_numbers?: string[];
  }>;
  issue_date?: string;
  return_period_days?: number;
  /** دفعة فورية اختيارية للمورد وقت أمر الشراء نفسه — مش شرط يفضل الكل آجل (على الحساب)،
   * الشراء ممكن يتسدد بالكامل أو جزء منه دلوقتي والباقي براحة صاحب المحل. */
  immediate_payment?: number;
}

export function useCreatePurchase(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      costingMethod,
    }: {
      input: CreatePurchaseInput;
      actorUserId: string | null;
      costingMethod: TenantSettings["costing_method"];
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");
      // تاريخ إصدار الفاتورة بقى هو نفسه اللي بيقود `created_at` للأمر وحركة المخزون/القيد
      // المرتبطين بيه، مش عمود عرض منفصل بس زي ما كان قبل كده — عشان يبان صح في ترتيب/فلاتر
      // التقارير لو العميل بيسجّل عملية قديمة بتاريخ مفتوح.
      const createdAt = input.issue_date ? dateInputToTimestamp(input.issue_date) : undefined;

      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", input.supplier_id)
        .single();
      if (supplierError || !supplier) throw new Error("المورد غير موجود");
      if (!supplier.active) throw new Error("المورد غير نشط");

      const { data: products, error: productsError } = await supabase
        .from("products")
        .select("*")
        .eq("tenant_id", tenantId);
      if (productsError) throw new Error(productsError.message);
      const { data: existingSerials, error: serialsError } = await supabase
        .from("product_serials")
        .select("serial_number")
        .eq("tenant_id", tenantId);
      if (serialsError) throw new Error(serialsError.message);

      const seenSerialsThisPurchase = new Set<string>();
      const purchaseItems: PurchaseItem[] = [];
      for (const line of input.items) {
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
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
            if (
              (existingSerials ?? []).some((s) => (s.serial_number as string).toLowerCase() === key)
            ) {
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

      const total = Math.round(purchaseItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
      const immediatePayment = input.immediate_payment ?? 0;
      if (immediatePayment < 0) throw new Error("الدفعة الفورية لا يمكن أن تكون سالبة");
      if (immediatePayment > total) {
        throw new Error(`الدفعة الفورية أكبر من إجمالي أمر الشراء (${total} ج.م)`);
      }

      const purchase_number = await nextInstallmentDocNumber(
        "purchases",
        "purchase_number",
        tenantId,
        "PUR",
      );

      // Every line already validated above, so applying effects here can't fail partway
      // through — same discipline as data-store.ts's createPurchase.
      for (const item of purchaseItems) {
        const productBefore = (products ?? []).find((p) => p.id === item.product_id) as Product;
        const { data: movements, error: movementsError } = await supabase
          .from("inventory_movements")
          .select("quantity")
          .eq("tenant_id", tenantId)
          .eq("product_id", item.product_id);
        if (movementsError) throw new Error(movementsError.message);
        const stockBefore = productBefore.serial_required
          ? 0 // serial-tracked products don't use weighted-average cost math below anyway
          : (movements ?? []).reduce((sum, m) => sum + (m.quantity as number), 0);

        await performReceiveStock(
          tenantId,
          productBefore,
          item.quantity,
          item.serial_numbers.length > 0 ? item.serial_numbers : undefined,
          actorUserId,
          purchase_number,
          createdAt,
        );

        const newCost =
          costingMethod === "last_purchase"
            ? item.unit_cost
            : stockBefore + item.quantity > 0
              ? Math.round(
                  ((stockBefore * productBefore.cost_price + item.quantity * item.unit_cost) /
                    (stockBefore + item.quantity)) *
                    100,
                ) / 100
              : item.unit_cost;
        const { data: updatedProduct, error: updateCostError } = await supabase
          .from("products")
          .update({ cost_price: newCost })
          .eq("id", item.product_id)
          .select()
          .single();
        if (updateCostError) throw new Error(updateCostError.message);
        await insertAuditLog({
          tenant_id: tenantId,
          user_id: actorUserId,
          action: "product.update",
          entity: "products",
          entity_id: item.product_id,
          old_value: productBefore,
          new_value: updatedProduct,
        });
      }

      const { data: purchase, error: purchaseError } = await supabase
        .from("purchases")
        .insert({
          tenant_id: tenantId,
          purchase_number,
          supplier_id: supplier.id as string,
          supplier_name: supplier.name as string,
          items: purchaseItems,
          total,
          user_id: actorUserId,
          ...(input.issue_date && { issue_date: input.issue_date }),
          ...(input.return_period_days !== undefined && {
            return_period_days: input.return_period_days,
          }),
          ...(createdAt ? { created_at: createdAt } : {}),
        })
        .select()
        .single();
      if (purchaseError) throw new Error(purchaseError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "purchase.create",
        entity: "purchases",
        entity_id: purchase.id as string,
        new_value: purchase,
      });

      // الشراء نفسه بيتسجل كدين على المحل (Payable) بإجمالي القيمة، بغض النظر عن أي دفعة
      // فورية — الدفعة الفورية (لو فيه) بتتسجل كسداد منفصل بعد كده مباشرة، زي أي دفعة مورد
      // عادية، عشان القيد يفضل متوازن (Dr 1200 / Cr 2000 بالإجمالي، وبعدها Dr 2000 / Cr 1000
      // بقيمة المدفوع لو حصل).
      try {
        await performPostJournalEntry(
          tenantId,
          [
            { account_code: "1200", account_name: ACCOUNT_NAMES["1200"], debit: total, credit: 0 },
            { account_code: "2000", account_name: ACCOUNT_NAMES["2000"], debit: 0, credit: total },
          ],
          `أمر شراء ${purchase_number}`,
          "purchase",
          purchase.id as string,
          createdAt,
        );
      } catch (e) {
        console.warn("فشل ترحيل قيد الشراء:", e instanceof Error ? e.message : e);
      }

      // دفعة فورية اختيارية وقت الشراء نفسه — مش شرط يفضل كل شيء آجل على المورد؛ صاحب
      // المحل ممكن يدفع كامل المبلغ أو جزء منه دلوقتي والباقي براحته لاحقًا من /suppliers.
      if (immediatePayment > 0) {
        try {
          const { data: payment, error: paymentError } = await supabase
            .from("supplier_payments")
            .insert({
              tenant_id: tenantId,
              supplier_id: supplier.id as string,
              amount: immediatePayment,
              user_id: actorUserId,
              ...(createdAt ? { created_at: createdAt } : {}),
            })
            .select()
            .single();
          if (paymentError) throw new Error(paymentError.message);
          await insertAuditLog({
            tenant_id: tenantId,
            user_id: actorUserId,
            action: "supplier_payment.record",
            entity: "supplier_payments",
            entity_id: payment.id as string,
            new_value: payment,
          });
          await postFinancials(
            tenantId,
            "main",
            "purchase_payment",
            -immediatePayment,
            actorUserId,
            purchase_number,
            [
              {
                account_code: "2000",
                account_name: ACCOUNT_NAMES["2000"],
                debit: immediatePayment,
                credit: 0,
              },
              {
                account_code: "1000",
                account_name: ACCOUNT_NAMES["1000"],
                debit: 0,
                credit: immediatePayment,
              },
            ],
            `دفعة فورية عند الشراء ${purchase_number} لمورد ${supplier.name as string}`,
            "supplier_payment",
            payment.id as string,
            createdAt,
          );
        } catch (e) {
          console.warn("فشل تسجيل الدفعة الفورية للمورد:", e instanceof Error ? e.message : e);
        }
      }

      return purchase as Purchase;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["supplier_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useRecordSupplierPayment(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      supplierId,
      amount,
      actorUserId,
    }: {
      supplierId: string;
      amount: number;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");

      const { data: supplier, error: supplierError } = await supabase
        .from("suppliers")
        .select("*")
        .eq("id", supplierId)
        .single();
      if (supplierError || !supplier) throw new Error("المورد غير موجود");

      const [{ data: purchases, error: purchasesError }, { data: payments, error: paymentsError }] =
        await Promise.all([
          supabase
            .from("purchases")
            .select("total")
            .eq("tenant_id", tenantId)
            .eq("supplier_id", supplierId),
          supabase
            .from("supplier_payments")
            .select("amount")
            .eq("tenant_id", tenantId)
            .eq("supplier_id", supplierId),
        ]);
      if (purchasesError) throw new Error(purchasesError.message);
      if (paymentsError) throw new Error(paymentsError.message);
      const totalPurchased = (purchases ?? []).reduce((sum, p) => sum + (p.total as number), 0);
      const totalPaid = (payments ?? []).reduce((sum, p) => sum + (p.amount as number), 0);
      const balance = Math.round((totalPurchased - totalPaid) * 100) / 100;
      if (amount > balance) {
        throw new Error(`المبلغ أكبر من الرصيد المستحق للمورد (${balance} ج.م)`);
      }

      const { data, error } = await supabase
        .from("supplier_payments")
        .insert({ tenant_id: tenantId, supplier_id: supplierId, amount, user_id: actorUserId })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "supplier_payment.record",
        entity: "supplier_payments",
        entity_id: data.id as string,
        new_value: data,
      });

      await postFinancials(
        tenantId,
        "main",
        "purchase_payment",
        -amount,
        actorUserId,
        data.id as string,
        [
          { account_code: "2000", account_name: ACCOUNT_NAMES["2000"], debit: amount, credit: 0 },
          { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: 0, credit: amount },
        ],
        `دفعة لمورد ${supplier.name as string}`,
        "supplier_payment",
        data.id as string,
      );

      return data as SupplierPayment;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["supplier_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Partners (شركاء التمويل) — parallel funding-partner ledger, layered on
 * top of the sale/installment flows above without ever touching their own treasury/journal
 * postings. A partner's balance is never stored — always the sum of their `partner_transactions`
 * rows, same "balance = sum of the ledger" principle as computeAccountBalance/getSupplierBalance
 * above. `useCreatePartner`/`useAddPartnerFunding` are independent of any sale; the sale-time
 * settlement path (writing one `sale_settlement` row per partner picked on a deal) lives in
 * the sale/installment-contract route files themselves — best-effort, same discipline as
 * postFinancials, since the sale has already succeeded by the time partner attribution runs. */

export function usePartners(tenantId: string | undefined) {
  return useTenantList<Partner>("partners", tenantId, { orderBy: "created_at", ascending: false });
}

export function usePartnerTransactions(tenantId: string | undefined) {
  return useTenantList<PartnerTransaction>("partner_transactions", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

/** Mirrors computeAccountBalance/getSupplierBalance exactly — a partner's balance (capital
 * still owed to them + profit not yet withdrawn) is the running sum of their signed
 * `partner_transactions.amount`, never a stored counter. */
export function computePartnerBalance(
  partnerId: string,
  transactions: PartnerTransaction[],
): number {
  return (
    Math.round(
      transactions.filter((t) => t.partner_id === partnerId).reduce((sum, t) => sum + t.amount, 0) *
        100,
    ) / 100
  );
}

/** Pure calculation, no DB — one partner's cut of one deal. `splitPct` is this partner's share
 * of the deal itself (equal by default among however many partners are picked, editable per
 * partner at sale time); `profitSharePct` is that partner's own permanent profit-sharing rate
 * (Partner.profit_share_pct). Profit is computed on goods margin only (cashSubtotal - cost),
 * never on installment financing revenue — matches the existing 3000/3100 account split. */
export function computePartnerDealPreview(
  cashSubtotal: number,
  cost: number,
  splitPct: number,
  profitSharePct: number,
): { costRecovered: number; profitAmount: number; total: number } {
  const shareOfCost = Math.round(cost * (splitPct / 100) * 100) / 100;
  const shareOfMargin = Math.round((cashSubtotal - cost) * (splitPct / 100) * 100) / 100;
  const profitAmount = Math.round(shareOfMargin * (profitSharePct / 100) * 100) / 100;
  return {
    costRecovered: shareOfCost,
    profitAmount,
    total: Math.round((shareOfCost + profitAmount) * 100) / 100,
  };
}

export function useCreatePartner(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      createdAt,
    }: {
      input: Omit<Partner, "id" | "tenant_id" | "code" | "active" | "created_at">;
      actorUserId: string | null;
      /** تاريخ انضمام مفتوح — لشريك موجود فعليًا من قبل بيتسجّل دلوقتي بس. */
      createdAt?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const data = await insertWithGeneratedCode<Partner>("partners", tenantId, "PTR", (code) => ({
        ...input,
        tenant_id: tenantId,
        code,
        active: true,
        ...(createdAt ? { created_at: createdAt } : {}),
      }));
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner.create",
        entity: "partners",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as Partner;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** تعديل بيانات الشريك الشخصية بس (اسمه/هاتفه/نسبة ربحه الافتراضية/ملاحظاته/حالة نشاطه) —
 * مفيش أي تعديل مباشر على رصيده أو تمويله هنا؛ ده بيفضل بس من خلال useAddPartnerFunding/
 * useWithdrawPartnerFunds كأوبشن خارجي منفصل تمامًا، زي useUpdateCustomer بالظبط. */
export function useUpdatePartner(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
      actorUserId,
    }: {
      id: string;
      patch: Partial<Omit<Partner, "id" | "tenant_id" | "code" | "created_at">>;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("partners")
        .select("*")
        .eq("id", id)
        .single();
      if (beforeError || !before) throw new Error(beforeError?.message ?? "الشريك غير موجود");
      const { data, error } = await supabase
        .from("partners")
        .update(patch)
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner.update",
        entity: "partners",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as Partner;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** حذف حقيقي دائم — بوابة باسورد الأونر في الواجهة. `partner_transactions.partner_id` هو
 * `on delete restrict` (migration 0014)، فبوستجرس نفسه بيرفض الحذف طالما فيه أي حركة
 * (تمويل/سحب/تسوية صفقة) مسجّلة على الشريك ده — بيتلقط هنا كرسالة عربية واضحة تقوله يستخدم
 * زرار الإيقاف بدل الحذف، نفس أسلوب useDeleteCustomer بالظبط. */
export function useDeletePartner(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, actorUserId }: { id: string; actorUserId: string | null }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase.from("partners").select("*").eq("id", id).single();
      const { error } = await supabase.from("partners").delete().eq("id", id);
      if (error) {
        if (error.code === "23503") {
          throw new Error(
            "لا يمكن حذف هذا الشريك نهائيًا لأن له حركة مالية مسجّلة (تمويل/سحب/تسوية صفقة) — استخدم زر إيقاف بدلاً من الحذف.",
          );
        }
        throw new Error(error.message);
      }
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner.delete",
        entity: "partners",
        entity_id: id,
        old_value: before,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partners", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** إضافة تمويل لشريك في أي وقت (Top-up) — تسجّل صف `funding` في دفتره، بيزوّد رصيده مباشرة.
 * مفيش سقف/تحقق تاني غير المبلغ لازم يكون أكبر من صفر (نفس بساطة useRecordSupplierPayment). */
export function useAddPartnerFunding(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partnerId,
      amount,
      actorUserId,
      reason,
    }: {
      partnerId: string;
      amount: number;
      actorUserId: string | null;
      reason?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
      const { data, error } = await supabase
        .from("partner_transactions")
        .insert({
          tenant_id: tenantId,
          partner_id: partnerId,
          type: "funding",
          amount,
          user_id: actorUserId,
          ...(reason ? { reason } : {}),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner_transaction.funding",
        entity: "partner_transactions",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as PartnerTransaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** بيسجّل صف `sale_settlement` واحد لكل شريك مُختار وقت البيع — Best-effort تمامًا (فشلها ميوقفش
 * نجاح البيع نفسه، زي postFinancials بالظبط)، وبتُستدعى بعد نجاح useCreateSale/
 * useCreateInstallmentContract من route الصفحة نفسها.
 *
 * `amount` (اللي بيحرّك رصيد الشريك الفعلي، انظر computePartnerBalance) بيتسجّل بقيمة
 * `profitAmount` بس — مش `costRecovered + profitAmount`. `costRecovered` نصيب الشريك من
 * تكلفة الصفقة كان أصلاً معترف بيه ومحسوب في رصيده وقت التمويل نفسه (`funding`)؛ لو اتضاف
 * تاني هنا كان هيبقى ازدواج حقيقي (نفس الفلوس بتتحسب مرتين). `cost_recovered` يفضل متسجّل في
 * عموده المنفصل للتقارير/الشفافية بس ("اتخصم منه كذا من تمويله على الصفقة دي")، مش لحساب
 * الرصيد — ده بالظبط الغرض الموثَّق أصلاً في تعليق PartnerTransaction في types/index.ts. */
export async function settlePartnersForDeal(
  tenantId: string,
  actorUserId: string | null,
  reference: string,
  relatedSaleId: string | undefined,
  relatedContractId: string | undefined,
  entries: Array<{
    partnerId: string;
    productId?: string;
    costRecovered: number;
    profitAmount: number;
    /** Snapshot تاريخي (migration 0015) — قيمة الصفقة كاملة، نسبة تقسيم هذا الشريك منها،
     * ونسبة ربحه وقت التسوية بالظبط — عشان الشفافية/الحوكمة، بيثبّتوا حتى لو partners.
     * profit_share_pct اتغيّر بعدين. */
    dealValue: number;
    splitPct: number;
    profitSharePct: number;
  }>,
): Promise<void> {
  if (entries.length === 0) return;
  try {
    const { error } = await supabase.from("partner_transactions").insert(
      entries.map((e) => ({
        tenant_id: tenantId,
        partner_id: e.partnerId,
        type: "sale_settlement",
        amount: e.profitAmount,
        cost_recovered: e.costRecovered,
        profit_amount: e.profitAmount,
        deal_value: e.dealValue,
        split_pct: e.splitPct,
        profit_share_pct_snapshot: e.profitSharePct,
        reference,
        ...(relatedSaleId ? { related_sale_id: relatedSaleId } : {}),
        ...(relatedContractId ? { related_contract_id: relatedContractId } : {}),
        ...(e.productId ? { related_product_id: e.productId } : {}),
        user_id: actorUserId,
      })),
    );
    if (error) throw new Error(error.message);
  } catch (e) {
    console.warn("فشل تسوية الشركاء لهذه الصفقة:", e instanceof Error ? e.message : e);
  }
}

/** إجمالي نصيب الشريك من تكلفة الصفقات المتخصصة له لتاريخه — معلومة شفافية/حوكمة بس ("اتخصم
 * منه كام من تمويله المتاح")، لا تدخل في حساب رصيده (انظر تعليق settlePartnersForDeal). */
export function computePartnerAllocatedCost(
  partnerId: string,
  transactions: PartnerTransaction[],
): number {
  return (
    Math.round(
      transactions
        .filter((t) => t.partner_id === partnerId && t.type === "sale_settlement")
        .reduce((sum, t) => sum + t.cost_recovered, 0) * 100,
    ) / 100
  );
}

/** إجمالي ما موّله الشريك فعليًا (كل صفوف funding) — بغض النظر عن رصيده الحالي أو أرباحه. */
export function computePartnerTotalFunded(
  partnerId: string,
  transactions: PartnerTransaction[],
): number {
  return (
    Math.round(
      transactions
        .filter((t) => t.partner_id === partnerId && t.type === "funding")
        .reduce((sum, t) => sum + t.amount, 0) * 100,
    ) / 100
  );
}

/** إجمالي الأرباح المستحقة للشريك لسه ما اتصرفتش له — إجمالي الأرباح المكتسبة (مجموع
 * profit_amount عبر كل صفوفه، بغض النظر عن النوع) ناقص إجمالي ما صُرف له فعليًا كأرباح
 * (مجموع القيمة المطلقة لصفوف profit_payout). لا يلمس `amount`/رصيده الإجمالي (اللي بيفضل
 * يشمل رأس المال المتاح كمان) — ده تحديدًا سقف مبلغ "صرف الأرباح" الجديد. */
export function computePartnerAvailableProfit(
  partnerId: string,
  transactions: PartnerTransaction[],
): number {
  const own = transactions.filter((t) => t.partner_id === partnerId);
  const earned = own.reduce((sum, t) => sum + t.profit_amount, 0);
  const paidOut = own
    .filter((t) => t.type === "profit_payout")
    .reduce((sum, t) => sum + Math.abs(t.amount), 0);
  return Math.round((earned - paidOut) * 100) / 100;
}

/** صرف أرباح حقيقي لشريك — مختلف جوهريًا عن useWithdrawPartnerFunds: ده بيخصم فعليًا من خزينة
 * (أو خزينتين لو المبلغ أكبر من رصيد واحدة) عبر `partner_profit_payout` treasury_movement
 * حقيقي، بينما withdrawal لا يمس أي خزينة إطلاقًا. السقف هنا الأرباح المتاحة فقط (لا رأس
 * المال)، عكس withdrawal اللي سقفه الرصيد الكلي. */
export function usePayPartnerProfit(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partnerId,
      allocations,
      actorUserId,
      reason,
    }: {
      partnerId: string;
      /** خزينة واحدة أو اتنين — كل واحدة بمبلغها المستقل، والمجموع هو إجمالي الصرف. */
      allocations: Array<{ accountId: string; amount: number }>;
      actorUserId: string | null;
      reason?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const validAllocations = allocations.filter((a) => a.amount > 0);
      if (validAllocations.length === 0) throw new Error("أدخل مبلغ صرف صحيح");
      const totalAmount =
        Math.round(validAllocations.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;

      const { data: transactions, error: transactionsError } = await supabase
        .from("partner_transactions")
        .select("type, amount, profit_amount")
        .eq("tenant_id", tenantId)
        .eq("partner_id", partnerId);
      if (transactionsError) throw new Error(transactionsError.message);
      const availableProfit = computePartnerAvailableProfit(
        partnerId,
        (transactions ?? []) as PartnerTransaction[],
      );
      if (totalAmount > availableProfit) {
        throw new Error(`المبلغ أكبر من الأرباح المتاحة للصرف (${availableProfit} ج.م)`);
      }

      for (const allocation of validAllocations) {
        await performPostTreasuryMovement(
          tenantId,
          allocation.accountId,
          -allocation.amount,
          "partner_profit_payout",
          actorUserId,
          "صرف أرباح لشريك",
          reason,
        );
      }

      const { data, error } = await supabase
        .from("partner_transactions")
        .insert({
          tenant_id: tenantId,
          partner_id: partnerId,
          type: "profit_payout",
          amount: -totalAmount,
          user_id: actorUserId,
          ...(reason ? { reason } : {}),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner_transaction.profit_payout",
        entity: "partner_transactions",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as PartnerTransaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_accounts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** سحب مبلغ من رصيد الشريك المتاح (تمويل لسه متاح + أرباح مستحقة) — تسجيل صف `withdrawal`
 * بمبلغ سالب، زي useRecordSupplierPayment بالظبط (تحقق من الرصيد قبل السماح بالسحب). */
export function useWithdrawPartnerFunds(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      partnerId,
      amount,
      actorUserId,
      reason,
    }: {
      partnerId: string;
      amount: number;
      actorUserId: string | null;
      reason?: string;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
      const { data: transactions, error: transactionsError } = await supabase
        .from("partner_transactions")
        .select("amount")
        .eq("tenant_id", tenantId)
        .eq("partner_id", partnerId);
      if (transactionsError) throw new Error(transactionsError.message);
      const balance =
        Math.round((transactions ?? []).reduce((sum, t) => sum + (t.amount as number), 0) * 100) /
        100;
      if (amount > balance) {
        throw new Error(`المبلغ أكبر من رصيد الشريك المتاح (${balance} ج.م)`);
      }
      const { data, error } = await supabase
        .from("partner_transactions")
        .insert({
          tenant_id: tenantId,
          partner_id: partnerId,
          type: "withdrawal",
          amount: -amount,
          user_id: actorUserId,
          ...(reason ? { reason } : {}),
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "partner_transaction.withdrawal",
        entity: "partner_transactions",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as PartnerTransaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["partner_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Treasury (§68) / Shifts (§70) / Expenses (§73) / Accounting (§74-§75) ----
 * The last layer — this is what finally posts a cashier movement + journal entry for sales,
 * installment collections, and supplier payments (createSale/createInstallmentContract/
 * collectPayment/recordSupplierPayment above only ever updated stock/schedule/balance until
 * now, exactly as documented in each of their own comments). Posting looks up the tenant's
 * "cashier"/"main" account by `kind` (best-effort, mirroring data-store.ts's hardcoded
 * MAIN_ACCOUNT_ID/CASHIER_ACCOUNT_ID Mock IDs, which don't exist as real rows) — if the tenant
 * hasn't created that account yet from /treasury, the sale/collection/payment itself still
 * succeeds and only the treasury posting is skipped (logged to console), so this layer can
 * never retroactively break the flows already shipped and tested in earlier commits. */

const ACCOUNT_NAMES: Record<AccountCode, string> = {
  "1000": "الخزينة/النقدية",
  "1100": "عملاء (ذمم مدينة)",
  "1200": "المخزون",
  "2000": "موردون (ذمم دائنة)",
  "3000": "إيرادات المبيعات",
  "3100": "إيرادات التمويل",
  "5000": "المصروفات",
};

export function useTreasuryAccounts(tenantId: string | undefined) {
  return useTenantList<TreasuryAccount>("treasury_accounts", tenantId, { orderBy: "created_at" });
}

export function useCreateTreasuryAccount(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      name,
      kind,
      actorUserId,
      openingBalance,
    }: {
      name: string;
      kind: TreasuryAccount["kind"];
      actorUserId: string | null;
      /** رصيد افتتاحي اختياري — بيتسجّل كحركة `opening` (النوع محجوز أصلاً في القيد من أول
       * migration 0007، لكن ما كانش مُستخدَم فعليًا في أي مكان قبل كده) فور إنشاء الخزينة،
       * فيبقى جزء طبيعي من رصيدها المحسوب حيًا (computeAccountBalance) من أول لحظة. */
      openingBalance?: number;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data, error } = await supabase
        .from("treasury_accounts")
        .insert({ tenant_id: tenantId, name: name.trim(), kind, active: true })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "treasury_account.create",
        entity: "treasury_accounts",
        entity_id: data.id as string,
        new_value: data,
      });
      if (openingBalance && openingBalance > 0) {
        try {
          await performPostTreasuryMovement(
            tenantId,
            data.id as string,
            openingBalance,
            "opening",
            actorUserId,
            "رصيد افتتاحي",
          );
        } catch (e) {
          console.warn("فشل تسجيل الرصيد الافتتاحي للخزينة:", e instanceof Error ? e.message : e);
        }
      }
      return data as TreasuryAccount;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["treasury_accounts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useSetTreasuryAccountActive(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      active,
      actorUserId,
    }: {
      id: string;
      active: boolean;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before } = await supabase
        .from("treasury_accounts")
        .select("*")
        .eq("id", id)
        .single();
      const { data, error } = await supabase
        .from("treasury_accounts")
        .update({ active })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "treasury_account.update",
        entity: "treasury_accounts",
        entity_id: id,
        old_value: before,
        new_value: data,
      });
      return data as TreasuryAccount;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["treasury_accounts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useTreasuryMovements(tenantId: string | undefined) {
  return useTenantList<TreasuryMovement>("treasury_movements", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

/** Mirrors data-store.ts's getAccountBalance exactly — an account's balance is never stored,
 * always the sum of its movements. */
export function computeAccountBalance(accountId: string, movements: TreasuryMovement[]): number {
  return (
    Math.round(
      movements.filter((m) => m.account_id === accountId).reduce((sum, m) => sum + m.amount, 0) *
        100,
    ) / 100
  );
}

async function performPostTreasuryMovement(
  tenantId: string,
  accountId: string,
  amount: number,
  type: TreasuryMovement["type"],
  actorUserId: string | null,
  reference?: string,
  reason?: string,
  createdAt?: string,
): Promise<TreasuryMovement> {
  const { data: movements, error: movementsError } = await supabase
    .from("treasury_movements")
    .select("amount")
    .eq("tenant_id", tenantId)
    .eq("account_id", accountId);
  if (movementsError) throw new Error(movementsError.message);
  const before =
    Math.round((movements ?? []).reduce((sum, m) => sum + (m.amount as number), 0) * 100) / 100;
  const after = Math.round((before + amount) * 100) / 100;
  const { data: movement, error } = await supabase
    .from("treasury_movements")
    .insert({
      tenant_id: tenantId,
      account_id: accountId,
      type,
      amount,
      before,
      after,
      user_id: actorUserId,
      ...(reference ? { reference } : {}),
      ...(reason ? { reason } : {}),
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return movement as TreasuryMovement;
}

async function nextJournalEntryNumber(tenantId: string) {
  return nextInstallmentDocNumber("journal_entries", "entry_number", tenantId, "JE");
}

/** The only place a JournalEntry is ever created — mirrors data-store.ts's postJournalEntry,
 * including the debit=credit invariant check. */
async function performPostJournalEntry(
  tenantId: string,
  lines: JournalLine[],
  description: string,
  referenceType: string,
  referenceId: string,
  createdAt?: string,
): Promise<JournalEntry> {
  const totalDebit = Math.round(lines.reduce((sum, l) => sum + l.debit, 0) * 100) / 100;
  const totalCredit = Math.round(lines.reduce((sum, l) => sum + l.credit, 0) * 100) / 100;
  if (totalDebit !== totalCredit) {
    throw new Error(`قيد غير متوازن: مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }
  const entry_number = await nextJournalEntryNumber(tenantId);
  const { data: entry, error } = await supabase
    .from("journal_entries")
    .insert({
      tenant_id: tenantId,
      entry_number,
      lines,
      description,
      reference_type: referenceType,
      reference_id: referenceId,
      ...(createdAt ? { created_at: createdAt } : {}),
    })
    .select()
    .single();
  if (error) throw new Error(error.message);
  return entry as JournalEntry;
}

/** Looks for an active account of the exact requested kind first, then falls back through
 * "cashier" → "main" → any active account — so a tenant that only ever created one treasury
 * (of whatever kind) still gets every sale/collection posted somewhere real instead of the
 * movement being silently dropped just because it wasn't named/kinded exactly "cashier". */
async function findAccountIdByKind(
  tenantId: string,
  kind: TreasuryAccount["kind"],
): Promise<string | undefined> {
  const { data: accounts, error } = await supabase
    .from("treasury_accounts")
    .select("id, kind")
    .eq("tenant_id", tenantId)
    .eq("active", true);
  if (error || !accounts || accounts.length === 0) return undefined;
  const byKind = (k: TreasuryAccount["kind"]) =>
    (accounts as { id: string; kind: TreasuryAccount["kind"] }[]).find((a) => a.kind === k)?.id;
  return byKind(kind) ?? byKind("cashier") ?? byKind("main") ?? accounts[0]?.id;
}

/** Best-effort: never throws, never blocks the caller's own success — a sale/collection/
 * payment already succeeded by the time this runs, same reasoning as insertAuditLog. Wraps a
 * treasury movement + its matching journal entry as one unit so callers (useCreateSale,
 * useCollectPayment, ...) stay short. */
async function postFinancials(
  tenantId: string,
  accountKind: TreasuryAccount["kind"],
  movementType: TreasuryMovement["type"],
  amount: number,
  actorUserId: string | null,
  movementReference: string,
  lines: JournalLine[],
  description: string,
  referenceType: string,
  referenceId: string,
  createdAt?: string,
) {
  try {
    const accountId = await findAccountIdByKind(tenantId, accountKind);
    if (!accountId) {
      console.warn(`لا توجد خزينة من نوع "${accountKind}" — تخطّي ترحيل الحركة المالية`);
      return;
    }
    await performPostTreasuryMovement(
      tenantId,
      accountId,
      amount,
      movementType,
      actorUserId,
      movementReference,
      undefined,
      createdAt,
    );
    await performPostJournalEntry(
      tenantId,
      lines,
      description,
      referenceType,
      referenceId,
      createdAt,
    );
  } catch (e) {
    console.warn("فشل ترحيل الحركة المالية:", e instanceof Error ? e.message : e);
  }
}

export function useShifts(tenantId: string | undefined) {
  return useTenantList<Shift>("shifts", tenantId, { orderBy: "opened_at", ascending: false });
}

export function useOpenShift(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      openingBalance,
      actorUserId,
    }: {
      accountId: string;
      openingBalance: number;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (openingBalance < 0) throw new Error("الرصيد الافتتاحي لا يمكن أن يكون سالبًا");
      const { data: existingOpen, error: existingError } = await supabase
        .from("shifts")
        .select("id")
        .eq("account_id", accountId)
        .eq("status", "open");
      if (existingError) throw new Error(existingError.message);
      if ((existingOpen ?? []).length > 0) {
        throw new Error("يوجد وردية مفتوحة بالفعل على هذه الخزينة");
      }
      const { data, error } = await supabase
        .from("shifts")
        .insert({
          tenant_id: tenantId,
          account_id: accountId,
          opening_balance: openingBalance,
          opened_by: actorUserId,
          status: "open",
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "shift.open",
        entity: "shifts",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as Shift;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shifts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useCloseShift(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shiftId,
      countedAmount,
      reason,
      actorUserId,
      allocations,
    }: {
      shiftId: string;
      countedAmount: number;
      reason?: string;
      actorUserId: string | null;
      /** Optional: split today's counted cash across other treasuries (bank/wallet/cash-in-
       * hand) right at shift-close time — e.g. "من الـ10 آلاف: 3 محفظة، 4 بنك، 3 كاش". For each
       * entry this moves that amount OUT of the shift's own account and INTO the destination
       * account as a paired "transfer" movement, so both balances (and any card summing them)
       * reflect where the money actually ended up the moment the shift closes. */
      allocations?: Array<{ accountId: string; amount: number }>;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: shift, error: shiftError } = await supabase
        .from("shifts")
        .select("*")
        .eq("id", shiftId)
        .single();
      if (shiftError || !shift) throw new Error("الوردية غير موجودة");
      if (shift.status === "closed") throw new Error("الوردية مقفلة بالفعل");

      const { data: movements, error: movementsError } = await supabase
        .from("treasury_movements")
        .select("amount")
        .eq("account_id", shift.account_id as string)
        .gte("created_at", shift.opened_at as string);
      if (movementsError) throw new Error(movementsError.message);
      const netMovement = (movements ?? []).reduce((sum, m) => sum + (m.amount as number), 0);
      const expected = Math.round(((shift.opening_balance as number) + netMovement) * 100) / 100;
      const diff = Math.round((countedAmount - expected) * 100) / 100;
      if (diff !== 0 && !reason?.trim()) {
        throw new Error("لازم تكتب سبب الفرق قبل إقفال الوردية");
      }

      const validAllocations = (allocations ?? []).filter((a) => a.amount > 0);
      const allocatedTotal =
        Math.round(validAllocations.reduce((sum, a) => sum + a.amount, 0) * 100) / 100;
      if (allocatedTotal > countedAmount) {
        throw new Error("إجمالي التوزيع على الخزائن أكبر من المبلغ المعدود فعليًا");
      }

      const { data, error } = await supabase
        .from("shifts")
        .update({
          status: "closed",
          closing_counted_amount: countedAmount,
          closing_expected_amount: expected,
          closing_diff: diff,
          ...(reason?.trim() && { closing_reason: reason.trim() }),
          closed_by: actorUserId,
          closed_at: new Date().toISOString(),
        })
        .eq("id", shiftId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "shift.close",
        entity: "shifts",
        entity_id: shiftId,
        old_value: shift,
        new_value: data,
        ...(reason?.trim() && { reason: reason.trim() }),
      });

      for (const allocation of validAllocations) {
        try {
          await performPostTreasuryMovement(
            tenantId,
            shift.account_id as string,
            -allocation.amount,
            "transfer",
            actorUserId,
            `تسليم وردية ${shiftId.slice(0, 8)}`,
          );
          await performPostTreasuryMovement(
            tenantId,
            allocation.accountId,
            allocation.amount,
            "transfer",
            actorUserId,
            `تسليم وردية ${shiftId.slice(0, 8)}`,
          );
          await insertAuditLog({
            tenant_id: tenantId,
            user_id: actorUserId,
            action: "shift.allocate",
            entity: "treasury_movements",
            entity_id: allocation.accountId,
            new_value: {
              amount: allocation.amount,
              from: shift.account_id,
              to: allocation.accountId,
            },
          });
        } catch (e) {
          console.warn("فشل توزيع مبلغ من الوردية على خزينة:", e instanceof Error ? e.message : e);
        }
      }

      return data as Shift;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shifts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/** تعليم وردية مقفلة (بفرق ≠ صفر) كـ"تمت مراجعتها" — كل اللي بيعمله إنه يحفظ reviewed_at/
 * reviewed_by (migration 0020) بدل ما يفضل الكارت التنبيهي في /treasury ظاهر للأبد. لا يمس
 * closing_diff/closing_reason الأصليين، ولا أي حركة خزينة — مجرد علامة "اتشافت وخلصت". */
export function useMarkShiftReviewed(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      shiftId,
      actorUserId,
    }: {
      shiftId: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data, error } = await supabase
        .from("shifts")
        .update({ reviewed_at: new Date().toISOString(), reviewed_by: actorUserId })
        .eq("id", shiftId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "shift.review",
        entity: "shifts",
        entity_id: shiftId,
        new_value: data,
      });
      return data as Shift;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["shifts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useExpenses(tenantId: string | undefined) {
  return useTenantList<Expense>("expenses", tenantId, { orderBy: "created_at", ascending: false });
}

export function useRecordExpense(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      accountId,
      category,
      amount,
      reason,
      actorUserId,
      expenseApprovalThreshold,
      chargeTo = "treasury",
      partnerIds = [],
    }: {
      /** إلزامي لو `chargeTo === "treasury"` (السلوك التاريخي)، بيتجاهل لو "partners". */
      accountId?: string;
      category: string;
      amount: number;
      reason: string;
      actorUserId: string | null;
      expenseApprovalThreshold: number;
      /** "treasury" (الافتراضي) = نفس السلوك القديم بالظبط: خصم فعلي من خزينة + قيد محاسبي.
       * "partners" = المصروف بيتوزّع بالتساوي على الشركاء المُختارين كصفوف `expense_share` في
       * دفترهم — الخزينة لا تتأثر إطلاقًا، ولا يُنشأ أي قيد محاسبي جديد (نفس مبدأ
       * settlePartnersForDeal — طبقة موازية منفصلة). */
      chargeTo?: "treasury" | "partners";
      partnerIds?: string[];
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (amount <= 0) throw new Error("المبلغ يجب أن يكون أكبر من صفر");
      if (!category.trim()) throw new Error("نوع المصروف مطلوب");
      if (!reason.trim()) throw new Error("سبب المصروف مطلوب");
      if (chargeTo === "treasury" && !accountId) throw new Error("اختر الخزينة");
      if (chargeTo === "partners" && partnerIds.length === 0) {
        throw new Error("اختر شريك واحد على الأقل يتحمّل المصروف");
      }

      const { data: expense, error } = await supabase
        .from("expenses")
        .insert({
          tenant_id: tenantId,
          account_id: chargeTo === "treasury" ? accountId : null,
          charge_to: chargeTo,
          category: category.trim(),
          amount,
          reason: reason.trim(),
          needs_approval: amount > expenseApprovalThreshold,
          user_id: actorUserId,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "expense.record",
        entity: "expenses",
        entity_id: expense.id as string,
        new_value: expense,
        reason: expense.reason as string,
      });

      if (chargeTo === "partners") {
        try {
          const share = Math.round((amount / partnerIds.length) * 100) / 100;
          const { error: shareError } = await supabase.from("partner_transactions").insert(
            partnerIds.map((partnerId) => ({
              tenant_id: tenantId,
              partner_id: partnerId,
              type: "expense_share",
              amount: -share,
              reference: category.trim(),
              reason: reason.trim(),
              related_expense_id: expense.id as string,
              user_id: actorUserId,
            })),
          );
          if (shareError) throw new Error(shareError.message);
        } catch (e) {
          console.warn("فشل توزيع المصروف على الشركاء:", e instanceof Error ? e.message : e);
        }
        return expense as Expense;
      }

      try {
        await performPostTreasuryMovement(
          tenantId,
          accountId as string,
          -amount,
          "expense",
          actorUserId,
          category.trim(),
          reason.trim(),
        );
        await performPostJournalEntry(
          tenantId,
          [
            { account_code: "5000", account_name: ACCOUNT_NAMES["5000"], debit: amount, credit: 0 },
            { account_code: "1000", account_name: ACCOUNT_NAMES["1000"], debit: 0, credit: amount },
          ],
          `مصروف: ${category.trim()} — ${reason.trim()}`,
          "expense",
          expense.id as string,
        );
      } catch (e) {
        console.warn("فشل ترحيل قيد المصروف:", e instanceof Error ? e.message : e);
      }

      return expense as Expense;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_accounts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["partner_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useApproveExpense(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      expenseId,
      note,
      actorUserId,
    }: {
      expenseId: string;
      note: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: before, error: beforeError } = await supabase
        .from("expenses")
        .select("*")
        .eq("id", expenseId)
        .single();
      if (beforeError || !before) throw new Error("المصروف غير موجود");
      if (!before.needs_approval) throw new Error("هذا المصروف لا يحتاج اعتماد أصلاً");
      const { data, error } = await supabase
        .from("expenses")
        .update({
          needs_approval: false,
          approved_by: actorUserId,
          approved_at: new Date().toISOString(),
          approval_note: note.trim(),
        })
        .eq("id", expenseId)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "expense.approve",
        entity: "expenses",
        entity_id: expenseId,
        old_value: { needs_approval: true },
        new_value: { needs_approval: false, approval_note: data.approval_note },
        reason: note,
      });
      return data as Expense;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["expenses", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useJournalEntries(tenantId: string | undefined) {
  return useTenantList<JournalEntry>("journal_entries", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

/* ---------------- Returns (§79/§81) / Exchange (§82) ---------------- */

export function useSaleReturns(tenantId: string | undefined) {
  return useTenantList<SaleReturn>("sale_returns", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export interface CreateReturnInput {
  sale_id: string;
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  reason: string;
}

export function useCreateReturn(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      returnPeriodDays,
    }: {
      input: CreateReturnInput;
      actorUserId: string | null;
      returnPeriodDays: number;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.items.length === 0) throw new Error("لازم تختار صنف واحد على الأقل للإرجاع");
      if (!input.reason.trim()) throw new Error("سبب الإرجاع مطلوب");

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("*")
        .eq("id", input.sale_id)
        .single();
      if (saleError || !sale) throw new Error("الفاتورة غير موجودة");
      if (sale.status === "cancelled") throw new Error("لا يمكن إرجاع فاتورة ملغاة");
      const saleAgeDays =
        (Date.now() - new Date(sale.created_at as string).getTime()) / (24 * 60 * 60 * 1000);
      if (saleAgeDays > returnPeriodDays) {
        throw new Error(`انتهت فترة السماح بالإرجاع (${returnPeriodDays} يوم)`);
      }

      const [
        { data: previousReturns, error: previousReturnsError },
        { data: products, error: productsError },
        { data: allSerials, error: serialsError },
      ] = await Promise.all([
        supabase.from("sale_returns").select("items").eq("sale_id", input.sale_id),
        supabase.from("products").select("*").eq("tenant_id", tenantId),
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
      ]);
      if (previousReturnsError) throw new Error(previousReturnsError.message);
      if (productsError) throw new Error(productsError.message);
      if (serialsError) throw new Error(serialsError.message);

      const saleItems = sale.items as SaleItem[];
      const priorReturnItems = (previousReturns ?? []).flatMap((r) => r.items as ReturnItem[]);

      const returnItems: ReturnItem[] = [];
      const serialIdsToInspect = new Set<string>();

      for (const line of input.items) {
        const saleLine = saleItems.find(
          (i) =>
            i.product_id === line.product_id &&
            (line.serial_id ? i.serial_id === line.serial_id : !i.serial_id),
        );
        if (!saleLine) throw new Error("الصنف غير موجود في هذه الفاتورة");
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
        if (!product) throw new Error("منتج غير موجود");

        if (product.serial_required) {
          if (line.quantity !== 1 || !line.serial_id) {
            throw new Error(`إرجاع منتج السيريال "${product.name}" لازم سيريال واحد محدد`);
          }
          if (serialIdsToInspect.has(line.serial_id)) {
            throw new Error("نفس السيريال اتكرر في طلب الإرجاع");
          }
          if (priorReturnItems.some((ri) => ri.serial_id === line.serial_id)) {
            throw new Error(`السيريال "${saleLine.serial_number}" اتُرجع قبل كده`);
          }
          const serial = (allSerials ?? []).find((s) => s.id === line.serial_id);
          if (!serial || serial.status !== "sold") {
            throw new Error("السيريال مش في حالة تسمح بالإرجاع");
          }
          serialIdsToInspect.add(line.serial_id);
          returnItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: saleLine.unit_price,
            line_total: saleLine.unit_price,
          });
        } else {
          const alreadyReturnedQty = priorReturnItems
            .filter((ri) => ri.product_id === product.id && !ri.serial_id)
            .reduce((s, ri) => s + ri.quantity, 0);
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
      const return_number = await nextInstallmentDocNumber(
        "sale_returns",
        "return_number",
        tenantId,
        "RET",
      );

      if (serialIdsToInspect.size > 0) {
        const { error: updateSerialsError } = await supabase
          .from("product_serials")
          .update({ status: "inspection" })
          .in("id", Array.from(serialIdsToInspect));
        if (updateSerialsError) throw new Error(updateSerialsError.message);
      }

      const nonSerialItems = returnItems.filter((i) => !i.serial_id);
      if (nonSerialItems.length > 0) {
        const movementInserts = [];
        for (const item of nonSerialItems) {
          const { data: movements, error: movementsError } = await supabase
            .from("inventory_movements")
            .select("quantity")
            .eq("tenant_id", tenantId)
            .eq("product_id", item.product_id);
          if (movementsError) throw new Error(movementsError.message);
          const before = (movements ?? []).reduce((sum, m) => sum + (m.quantity as number), 0);
          movementInserts.push({
            tenant_id: tenantId,
            product_id: item.product_id,
            type: "return",
            quantity: item.quantity,
            before,
            after: before + item.quantity,
            user_id: actorUserId,
            reference: return_number,
          });
        }
        const { error: insertMovementsError } = await supabase
          .from("inventory_movements")
          .insert(movementInserts);
        if (insertMovementsError) throw new Error(insertMovementsError.message);
      }

      const { data: saleReturn, error: returnError } = await supabase
        .from("sale_returns")
        .insert({
          tenant_id: tenantId,
          return_number,
          sale_id: sale.id as string,
          customer_id: sale.customer_id,
          customer_name: sale.customer_name,
          items: returnItems,
          refund_amount,
          reason: input.reason.trim(),
          user_id: actorUserId,
        })
        .select()
        .single();
      if (returnError) throw new Error(returnError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "sale_return.create",
        entity: "sale_returns",
        entity_id: saleReturn.id as string,
        new_value: saleReturn,
        reason: input.reason.trim(),
      });

      await postFinancials(
        tenantId,
        "cashier",
        "return",
        -refund_amount,
        actorUserId,
        return_number,
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
        saleReturn.id as string,
      );

      return saleReturn as SaleReturn;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sale_returns", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

export function useExchangeTransactions(tenantId: string | undefined) {
  return useTenantList<ExchangeTransaction>("exchange_transactions", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export interface CreateExchangeInput {
  original_sale_id: string;
  returned_items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  new_items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  reason: string;
}

export function useCreateExchange(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
    }: {
      input: CreateExchangeInput;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.returned_items.length === 0) throw new Error("لازم صنف واحد على الأقل للإرجاع");
      if (input.new_items.length === 0) throw new Error("لازم صنف واحد على الأقل للاستبدال به");
      if (!input.reason.trim()) throw new Error("سبب الاستبدال مطلوب");

      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("*")
        .eq("id", input.original_sale_id)
        .single();
      if (saleError || !sale) throw new Error("الفاتورة الأصلية غير موجودة");
      const saleItems = sale.items as SaleItem[];

      const [
        { data: products, error: productsError },
        { data: allSerials, error: serialsError },
        { data: movements, error: movementsError },
        { data: priorReturns, error: priorReturnsError },
        { data: priorExchanges, error: priorExchangesError },
      ] = await Promise.all([
        supabase.from("products").select("*").eq("tenant_id", tenantId),
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("tenant_id", tenantId),
        supabase.from("sale_returns").select("items").eq("sale_id", input.original_sale_id),
        supabase
          .from("exchange_transactions")
          .select("returned_items")
          .eq("original_sale_id", input.original_sale_id),
      ]);
      if (productsError) throw new Error(productsError.message);
      if (serialsError) throw new Error(serialsError.message);
      if (movementsError) throw new Error(movementsError.message);
      if (priorReturnsError) throw new Error(priorReturnsError.message);
      if (priorExchangesError) throw new Error(priorExchangesError.message);

      // Same "already accounted for" check useCreateReturn does — a non-serial line here
      // could otherwise be returned/exchanged past what the original sale actually contained,
      // across any mix of prior returns and prior exchanges of this same sale.
      const priorConsumedItems: ReturnItem[] = [
        ...(priorReturns ?? []).flatMap((r) => r.items as ReturnItem[]),
        ...(priorExchanges ?? []).flatMap((e) => e.returned_items as ReturnItem[]),
      ];

      const returnedItems: ReturnItem[] = [];
      const returnedSerialIds = new Set<string>();
      for (const line of input.returned_items) {
        const saleLine = saleItems.find(
          (i) =>
            i.product_id === line.product_id &&
            (line.serial_id ? i.serial_id === line.serial_id : !i.serial_id),
        );
        if (!saleLine) throw new Error("صنف الإرجاع غير موجود في الفاتورة الأصلية");
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
        if (!product) throw new Error("منتج غير موجود");
        if (product.serial_required) {
          if (line.quantity !== 1 || !line.serial_id) {
            throw new Error(`إرجاع "${product.name}" لازم سيريال واحد محدد`);
          }
          const serial = (allSerials ?? []).find((s) => s.id === line.serial_id);
          if (!serial || serial.status !== "sold") {
            throw new Error("السيريال مش في حالة تسمح بالإرجاع");
          }
          returnedSerialIds.add(serial.id as string);
          returnedItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: saleLine.unit_price,
            line_total: saleLine.unit_price,
          });
        } else {
          const alreadyConsumedQty = priorConsumedItems
            .filter((ri) => ri.product_id === product.id && !ri.serial_id)
            .reduce((s, ri) => s + ri.quantity, 0);
          const remaining = saleLine.quantity - alreadyConsumedQty;
          if (line.quantity <= 0 || line.quantity > remaining) {
            throw new Error(
              `كمية إرجاع غير صحيحة للمنتج "${product.name}" (المتاح للإرجاع ${remaining})`,
            );
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
        const product = (products ?? []).find((p) => p.id === line.product_id) as
          Product | undefined;
        if (!product) throw new Error("منتج غير موجود");
        if (!product.active) throw new Error(`المنتج "${product.name}" غير نشط`);
        const currentStock = stockTracker.has(product.id)
          ? (stockTracker.get(product.id) as number)
          : computeProductStock(
              product.id,
              product.serial_required,
              (allSerials ?? []) as ProductSerial[],
              (movements ?? []) as InventoryMovement[],
            );
        if (product.serial_required) {
          if (line.quantity !== 1 || !line.serial_id) {
            throw new Error(`اختر سيريال للمنتج "${product.name}"`);
          }
          if (soldSerialIds.has(line.serial_id) || returnedSerialIds.has(line.serial_id)) {
            throw new Error("تعارض في اختيار السيريالات");
          }
          const serial = (allSerials ?? []).find(
            (s) => s.id === line.serial_id && s.product_id === product.id,
          );
          if (!serial || serial.status !== "available") {
            throw new Error(`السيريال غير متاح للمنتج "${product.name}"`);
          }
          soldSerialIds.add(serial.id as string);
          newItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
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
      const exchange_number = await nextInstallmentDocNumber(
        "exchange_transactions",
        "exchange_number",
        tenantId,
        "EXC",
      );

      if (returnedSerialIds.size > 0) {
        const { error: updateReturnedError } = await supabase
          .from("product_serials")
          .update({ status: "inspection" })
          .in("id", Array.from(returnedSerialIds));
        if (updateReturnedError) throw new Error(updateReturnedError.message);
      }
      if (soldSerialIds.size > 0) {
        const { error: updateSoldError } = await supabase
          .from("product_serials")
          .update({ status: "sold" })
          .in("id", Array.from(soldSerialIds));
        if (updateSoldError) throw new Error(updateSoldError.message);
      }

      const nonSerialReturned = returnedItems.filter((i) => !i.serial_id);
      const movementInserts: Array<Record<string, unknown>> = [];
      for (const item of nonSerialReturned) {
        const { data: itemMovements, error: itemMovementsError } = await supabase
          .from("inventory_movements")
          .select("quantity")
          .eq("tenant_id", tenantId)
          .eq("product_id", item.product_id);
        if (itemMovementsError) throw new Error(itemMovementsError.message);
        const before = (itemMovements ?? []).reduce((sum, m) => sum + (m.quantity as number), 0);
        movementInserts.push({
          tenant_id: tenantId,
          product_id: item.product_id,
          type: "return",
          quantity: item.quantity,
          before,
          after: before + item.quantity,
          user_id: actorUserId,
          reference: exchange_number,
        });
      }
      for (const m of movementDrafts) {
        movementInserts.push({
          tenant_id: tenantId,
          product_id: m.product_id,
          type: "sale",
          quantity: m.quantity,
          before: m.before,
          after: m.after,
          user_id: actorUserId,
          reference: exchange_number,
        });
      }
      if (movementInserts.length > 0) {
        const { error: insertMovementsError } = await supabase
          .from("inventory_movements")
          .insert(movementInserts);
        if (insertMovementsError) throw new Error(insertMovementsError.message);
      }

      const { data: exchange, error: exchangeError } = await supabase
        .from("exchange_transactions")
        .insert({
          tenant_id: tenantId,
          exchange_number,
          original_sale_id: sale.id as string,
          returned_items: returnedItems,
          new_items: newItems,
          price_difference,
          reason: input.reason.trim(),
          user_id: actorUserId,
        })
        .select()
        .single();
      if (exchangeError) throw new Error(exchangeError.message);

      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "exchange.create",
        entity: "exchange_transactions",
        entity_id: exchange.id as string,
        new_value: exchange,
        reason: input.reason.trim(),
      });

      try {
        if (price_difference !== 0) {
          const cashierId = await findAccountIdByKind(tenantId, "cashier");
          if (cashierId) {
            await performPostTreasuryMovement(
              tenantId,
              cashierId,
              price_difference,
              "exchange",
              actorUserId,
              exchange_number,
            );
          }
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
        if (journalLines.length > 0) {
          await performPostJournalEntry(
            tenantId,
            journalLines,
            `استبدال ${exchange_number}`,
            "exchange",
            exchange.id as string,
          );
        }
      } catch (e) {
        console.warn("فشل ترحيل الحركة المالية:", e instanceof Error ? e.message : e);
      }

      return exchange as ExchangeTransaction;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["exchange_transactions", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["treasury_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["journal_entries", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Delivery Orders (§84) ---------------- */

export function useDeliveryOrders(tenantId: string | undefined) {
  return useTenantList<DeliveryOrder>("delivery_orders", tenantId, {
    orderBy: "created_at",
    ascending: false,
  });
}

export function useScheduleDelivery(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      saleId,
      address,
      scheduledDate,
      actorUserId,
    }: {
      saleId: string;
      address: string;
      scheduledDate: string;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (!address.trim()) throw new Error("العنوان مطلوب");
      if (!scheduledDate) throw new Error("تاريخ التوصيل مطلوب");
      const { data: sale, error: saleError } = await supabase
        .from("sales")
        .select("customer_name")
        .eq("id", saleId)
        .single();
      if (saleError || !sale) throw new Error("الفاتورة غير موجودة");

      const { data, error } = await supabase
        .from("delivery_orders")
        .insert({
          tenant_id: tenantId,
          sale_id: saleId,
          customer_name: sale.customer_name as string,
          address: address.trim(),
          scheduled_date: scheduledDate,
          status: "scheduled",
          user_id: actorUserId,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "delivery.schedule",
        entity: "delivery_orders",
        entity_id: data.id as string,
        new_value: data,
      });
      return data as DeliveryOrder;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery_orders", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

const DELIVERY_STATUS_ORDER: DeliveryOrder["status"][] = [
  "scheduled",
  "out_for_delivery",
  "delivered",
];

export function useAdvanceDeliveryStatus(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      nextStatus,
      actorUserId,
    }: {
      id: string;
      nextStatus: DeliveryOrder["status"];
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data: order, error: orderError } = await supabase
        .from("delivery_orders")
        .select("*")
        .eq("id", id)
        .single();
      if (orderError || !order) throw new Error("طلب التوصيل غير موجود");
      const currentIndex = DELIVERY_STATUS_ORDER.indexOf(order.status as DeliveryOrder["status"]);
      const nextIndex = DELIVERY_STATUS_ORDER.indexOf(nextStatus);
      if (nextIndex !== currentIndex + 1) {
        throw new Error("لا يمكن تخطي مراحل التوصيل");
      }

      const { data, error } = await supabase
        .from("delivery_orders")
        .update({
          status: nextStatus,
          ...(nextStatus === "delivered" && { delivered_at: new Date().toISOString() }),
        })
        .eq("id", id)
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "delivery.advance",
        entity: "delivery_orders",
        entity_id: id,
        old_value: order,
        new_value: data,
      });
      return data as DeliveryOrder;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["delivery_orders", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}

/* ---------------- Warranty (§86) — read-only, derived, no stored entity ---------------- */

export interface WarrantyInfo {
  product_name: string;
  serial_number: string | null;
  customer_name: string;
  sold_at: string;
  unit_price: number;
  warranty_months: number;
  warranty_end: string;
  active: boolean;
}

/** On-demand lookup (not a useQuery hook) — triggered by a search button, same pattern data-
 * store.ts's getWarrantyInfo used. `tenantId` is required, not optional: a free-text search
 * without it could leak another tenant's data. General search (not serial-only, since plenty
 * of devices have `serial_required=false`): matches products by name/code/brand/model *or* by
 * an exact serial number, then returns one warranty record per matching sold unit found across
 * cash sales and installment contracts — so the same product sold to several customers, or a
 * non-serialized device, both come back as a real, distinguishable list instead of a single
 * (necessarily serial-anchored) result. */
export async function fetchWarrantyInfo(
  tenantId: string,
  queryRaw: string,
): Promise<WarrantyInfo[]> {
  const query = queryRaw.trim();
  if (!query) return [];

  const [{ data: matchedProducts }, { data: matchedSerials }] = await Promise.all([
    supabase
      .from("products")
      .select("*")
      .eq("tenant_id", tenantId)
      .or(
        `name.ilike.%${query}%,code.ilike.%${query}%,brand.ilike.%${query}%,model.ilike.%${query}%`,
      ),
    supabase
      .from("product_serials")
      .select("*")
      .eq("tenant_id", tenantId)
      .ilike("serial_number", query),
  ]);

  const productIds = new Set((matchedProducts ?? []).map((p) => p.id as string));
  for (const s of matchedSerials ?? []) productIds.add(s.product_id as string);
  if (productIds.size === 0) return [];

  const productsById = new Map((matchedProducts ?? []).map((p) => [p.id as string, p]));
  const missingProductIds = [...productIds].filter((id) => !productsById.has(id));
  if (missingProductIds.length > 0) {
    const { data: extra } = await supabase.from("products").select("*").in("id", missingProductIds);
    for (const p of extra ?? []) productsById.set(p.id as string, p);
  }
  const serialById = new Map((matchedSerials ?? []).map((s) => [s.id as string, s]));

  const [{ data: cashSales }, { data: contracts }] = await Promise.all([
    supabase.from("sales").select("created_at, customer_name, items").eq("tenant_id", tenantId),
    supabase
      .from("installment_contracts")
      .select("created_at, customer_name, items")
      .eq("tenant_id", tenantId),
  ]);

  const results: WarrantyInfo[] = [];
  const sources: Array<{ created_at: string; customer_name: string; items: SaleItem[] }> = [
    ...((cashSales ?? []) as { created_at: string; customer_name: string; items: SaleItem[] }[]),
    ...((contracts ?? []) as { created_at: string; customer_name: string; items: SaleItem[] }[]),
  ];
  for (const source of sources) {
    for (const item of source.items) {
      if (!productIds.has(item.product_id)) continue;
      const product = productsById.get(item.product_id);
      if (!product || !product.warranty_months) continue;
      const soldAt = source.created_at;
      const warrantyEnd = new Date(soldAt);
      warrantyEnd.setMonth(warrantyEnd.getMonth() + (product.warranty_months as number));
      results.push({
        product_name: product.name as string,
        serial_number: item.serial_id
          ? (serialById.get(item.serial_id)?.serial_number ?? item.serial_number ?? null)
          : null,
        customer_name: source.customer_name,
        sold_at: soldAt,
        unit_price: item.unit_price,
        warranty_months: product.warranty_months as number,
        warranty_end: warrantyEnd.toISOString(),
        active: new Date() <= warrantyEnd,
      });
    }
  }
  return results.sort((a, b) => b.sold_at.localeCompare(a.sold_at));
}
