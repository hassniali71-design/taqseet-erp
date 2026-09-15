import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { supabase } from "@/lib/supabase-client";
import type {
  AuditLogEntry,
  Customer,
  InventoryMovement,
  Product,
  ProductBrand,
  ProductCategory,
  ProductSerial,
  Sale,
  SaleItem,
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

/* ---------------- Inventory (§21 Serial lifecycle, §29 Movement ledger) ----------------
 * Not yet converted: Stock Count (§30) and Purchasing's Goods Receipt still call the Mock
 * `receiveStock`/`adjustStock` in data-store.ts against the old localStorage arrays — only the
 * product detail page's manual "استلام كمية" and the POS sale flow below go through these real
 * hooks so far. */

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
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
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
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
  discount_pct: number;
}

export function useCreateSale(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      input,
      actorUserId,
      employeeDiscountLimitPct,
    }: {
      input: CreateSaleInput;
      actorUserId: string | null;
      employeeDiscountLimitPct: number;
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
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: product.cash_price,
            line_total: product.cash_price,
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
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            quantity: line.quantity,
            unit_price: product.cash_price,
            line_total: product.cash_price * line.quantity,
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

      return sale as Sale;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["sales", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}
