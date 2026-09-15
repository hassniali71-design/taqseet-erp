import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase-client";
import type {
  AuditLogEntry,
  Customer,
  Product,
  ProductBrand,
  ProductCategory,
  TenantSettings,
} from "@/types";

/** Tenant-scoped reads/writes for the Foundation layer, going straight through the browser
 * Supabase client (anon key) — Row Level Security (supabase/migrations/0001_foundation.sql)
 * is what actually restricts these to the signed-in user's own tenant, not application code.
 * Cross-tenant reads/writes (the Platform Control Room) go through src/lib/platform-server.ts
 * instead, which uses the service role key from a server function. */

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
    }: {
      input: Omit<Customer, "id" | "tenant_id" | "code" | "status" | "created_at">;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const code = await nextTenantCode("customers", tenantId, "CUST");
      const { data, error } = await supabase
        .from("customers")
        .insert({ ...input, tenant_id: tenantId, code, status: "active" })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "customer.create",
        entity: "customers",
        entity_id: data.id as string,
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
      const code = await nextTenantCode("products", tenantId, "PRD");
      const { data, error } = await supabase
        .from("products")
        .insert({ ...input, tenant_id: tenantId, code, active: true })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await insertAuditLog({
        tenant_id: tenantId,
        user_id: actorUserId,
        action: "product.create",
        entity: "products",
        entity_id: data.id as string,
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
