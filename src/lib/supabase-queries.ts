import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { calculateFinance, generateSchedule } from "@/lib/finance-engine";
import { supabase } from "@/lib/supabase-client";
import type {
  AuditLogEntry,
  Customer,
  Installment,
  InstallmentContract,
  InstallmentPayment,
  InstallmentPlan,
  InventoryMovement,
  Product,
  ProductBrand,
  ProductCategory,
  ProductSerial,
  PromiseToPay,
  Purchase,
  PurchaseItem,
  RestructureEvent,
  Sale,
  SaleItem,
  Supplier,
  SupplierPayment,
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
    }: {
      durationMonths: number;
      ratePct: number;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      const { data, error } = await supabase
        .from("installment_plans")
        .insert({
          tenant_id: tenantId,
          duration_months: durationMonths,
          rate_pct: ratePct,
          active: true,
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
  items: Array<{ product_id: string; serial_id?: string; quantity: number }>;
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
      creditHoldDays,
    }: {
      input: CreateInstallmentContractInput;
      actorUserId: string | null;
      minDownPaymentPct: number;
      creditHoldDays: number;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      if (input.items.length === 0) throw new Error("لازم تضيف صنف واحد على الأقل");

      const [
        { data: customerRow, error: customerError },
        { data: planRow, error: planError },
        { data: products, error: productsError },
        { data: allSerials, error: serialsError },
        { data: movements, error: movementsError },
        { data: contracts, error: contractsError },
        { data: installments, error: installmentsError },
      ] = await Promise.all([
        supabase.from("customers").select("*").eq("id", input.customer_id).single(),
        supabase.from("installment_plans").select("*").eq("id", input.plan_id).single(),
        supabase.from("products").select("*").eq("tenant_id", tenantId),
        supabase.from("product_serials").select("*").eq("tenant_id", tenantId),
        supabase
          .from("inventory_movements")
          .select("product_id, quantity")
          .eq("tenant_id", tenantId),
        supabase.from("installment_contracts").select("*").eq("tenant_id", tenantId),
        supabase.from("installments").select("*").eq("tenant_id", tenantId),
      ]);
      if (customerError || !customerRow) throw new Error("العميل غير موجود");
      if (planError || !planRow) throw new Error("خطة التقسيط غير موجودة");
      if (productsError) throw new Error(productsError.message);
      if (serialsError) throw new Error(serialsError.message);
      if (movementsError) throw new Error(movementsError.message);
      if (contractsError) throw new Error(contractsError.message);
      if (installmentsError) throw new Error(installmentsError.message);

      const customer = customerRow as Customer;
      const plan = planRow as InstallmentPlan;
      if (customer.status !== "active") throw new Error("العميل غير نشط");
      if (!plan.active) throw new Error("خطة التقسيط غير مفعّلة");

      if (
        computeCustomerOnCreditHold(
          customer.id,
          creditHoldDays,
          contracts as InstallmentContract[],
          installments as Installment[],
        )
      ) {
        throw new Error(
          "العميل موقوف عن التقسيط لتأخره في السداد (Credit Hold) — راجع صفحة العميل",
        );
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
          saleItems.push({
            product_id: product.id,
            product_name: product.name,
            serial_id: serial.id as string,
            serial_number: serial.serial_number as string,
            quantity: 1,
            unit_price: product.installment_price,
            line_total: product.installment_price,
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
            unit_price: product.installment_price,
            line_total: product.installment_price * line.quantity,
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

      const exposure = computeCustomerExposure(
        customer.id,
        contracts as InstallmentContract[],
        installments as Installment[],
      );
      const availableCredit = customer.credit_limit - exposure;
      if (totalAmount > availableCredit) {
        throw new Error(
          `تجاوز حد الائتمان: المتاح ${availableCredit} ج.م، والعقد يحتاج ${totalAmount} ج.م (الحد الكلي ${customer.credit_limit} ج.م، المستحق حاليًا ${exposure} ج.م)`,
        );
      }

      const schedule = generateSchedule(totalAmount, plan.duration_months);
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

      return contract as InstallmentContract;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
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

  return payment as InstallmentPayment;
}

export function useCollectPayment(tenantId: string | undefined) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      contractId,
      amount,
      actorUserId,
    }: {
      contractId: string;
      amount: number;
      actorUserId: string | null;
    }) => {
      if (!tenantId) throw new Error("لا توجد جلسة نشطة");
      return performCollectPayment(tenantId, contractId, amount, actorUserId);
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["installments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_contracts", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["installment_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["promises_to_pay", tenantId] });
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
      const code = await nextTenantCode("suppliers", tenantId, "SUP");
      const { data, error } = await supabase
        .from("suppliers")
        .insert({ ...input, tenant_id: tenantId, code, active: true })
        .select()
        .single();
      if (error) throw new Error(error.message);
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

      const total = Math.round(purchaseItems.reduce((sum, i) => sum + i.line_total, 0) * 100) / 100;
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

      return purchase as Purchase;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["purchases", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["products", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["product_serials", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["inventory_movements", tenantId] });
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
      return data as SupplierPayment;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["supplier_payments", tenantId] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", tenantId] });
    },
  });
}
