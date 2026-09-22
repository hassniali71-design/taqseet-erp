/**
 * One-off admin utility: seed the "المتحدة جروب" demo tenant with realistic, backdated
 * transaction history (products, customers, suppliers, partners, purchases, cash sales,
 * installment contracts + payments, expenses, treasury/accounting trail) — purely for a
 * demo/explainer video, not for any real customer's data.
 *
 * SAFETY: this script looks up the target tenant by the exact literal name "المتحدة جروب" and
 * refuses to write anything unless exactly one tenant matches. It must never be pointed at any
 * other tenant (in particular the real operating client's tenant) — every insert below is
 * scoped to the single resolved `tenant_id`.
 *
 * This bypasses the app's own business-logic layer (the browser-only Supabase client +
 * RLS-protected mutations in src/lib/supabase-queries.ts, which are React Query hooks and can't
 * be called from a standalone script) and re-implements simplified equivalents of the same
 * insert shapes directly with the service-role client — running balances/stock are tracked
 * in-memory instead of re-querying after every insert, since this script fully controls
 * insertion order. It intentionally does not replicate every nuance of the production financial
 * logic (e.g. no audit_logs rows, no promise-to-pay/returns/deliveries) — this data only needs
 * to look and behave like real usage in the UI, not be forensically perfect.
 *
 * Usage: bun run scripts/seed-demo-tenant.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your local .env, same as every other script
 * here — this bypasses RLS via the service role key. Safe to re-run (it only ever adds more
 * demo history), but re-running will duplicate customers/products with new codes each time.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY غير موجودين في .env");
  process.exit(1);
}

const DEMO_TENANT_NAME = "المتحدة جروب";

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

/* ---------------- Small helpers ---------------- */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** تاريخ مفتوح — `n` شهر قبل النهاردة، في يوم `day` من الشهر (لو محدد)، بساعة `hour`. */
function backdate(n: number, day?: number, hour = 11, minute = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - n);
  if (day) d.setDate(day);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

async function nextTenantCode(table: string, tenantId: string, prefix: string): Promise<string> {
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  return `${prefix}-${String((count ?? 0) + 1).padStart(4, "0")}`;
}

async function nextYearCode(
  table: string,
  column: string,
  tenantId: string,
  prefix: string,
): Promise<string> {
  const yearPrefix = `${prefix}-${new Date().getFullYear()}-`;
  const { count, error } = await supabase
    .from(table)
    .select("*", { count: "exact", head: true })
    .eq("tenant_id", tenantId)
    .ilike(column, `${yearPrefix}%`);
  if (error) throw new Error(error.message);
  return `${yearPrefix}${String((count ?? 0) + 1).padStart(6, "0")}`;
}

const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "الخزينة/النقدية",
  "1100": "عملاء (ذمم مدينة)",
  "1200": "المخزون",
  "2000": "موردون (ذمم دائنة)",
  "3000": "إيرادات المبيعات",
  "3100": "إيرادات التمويل",
  "5000": "المصروفات",
};

/* ---------------- Step 1: resolve the demo tenant (hard safety gate) ---------------- */

async function resolveDemoTenantId(): Promise<string> {
  const { data, error } = await supabase
    .from("tenants")
    .select("id, name")
    .eq("name", DEMO_TENANT_NAME);
  if (error) throw new Error(`تعذّر البحث عن التينانت: ${error.message}`);
  const matches = data ?? [];
  if (matches.length !== 1) {
    throw new Error(
      `الحماية أوقفت التنفيذ: لازم يكون فيه تينانت واحد بالظبط بالاسم "${DEMO_TENANT_NAME}" — ` +
        `لقيت ${matches.length}. صفر كتابة حصلت. تأكد من اسم التينانت في /platform قبل إعادة المحاولة.`,
    );
  }
  return (matches[0] as { id: string }).id;
}

/* ---------------- Step 2: categories + brands + products ---------------- */

interface SeededProduct {
  id: string;
  code: string;
  name: string;
  serial_required: boolean;
  cost_price: number;
  cash_price: number;
  installment_price: number;
}

async function seedCategoriesAndBrands(
  tenantId: string,
): Promise<{ categories: string[]; brands: string[] }> {
  const categoryNames = ["أجهزة كهربائية", "أجهزة منزلية", "موبايلات وإلكترونيات"];
  const brandNames = ["سامسونج", "تورنيدو", "شارب"];

  for (const name of categoryNames) {
    const { error } = await supabase
      .from("product_categories")
      .insert({ tenant_id: tenantId, name, active: true });
    if (error) throw new Error(`فشل إنشاء فئة "${name}": ${error.message}`);
  }
  for (const name of brandNames) {
    const { error } = await supabase
      .from("product_brands")
      .insert({ tenant_id: tenantId, name, active: true });
    if (error) throw new Error(`فشل إنشاء ماركة "${name}": ${error.message}`);
  }
  console.log(`✓ ${categoryNames.length} فئات + ${brandNames.length} ماركات`);
  return { categories: categoryNames, brands: brandNames };
}

async function seedProducts(tenantId: string): Promise<SeededProduct[]> {
  const drafts: Array<{
    name: string;
    brand: string;
    model?: string;
    category: string;
    unit: string;
    cost_price: number;
    cash_price: number;
    installment_price: number;
    min_stock: number;
    max_stock: number;
    warranty_months?: number;
    serial_required: boolean;
  }> = [
    {
      name: "ثلاجة سامسونج 18 قدم",
      brand: "سامسونج",
      model: "RT50",
      category: "أجهزة كهربائية",
      unit: "قطعة",
      cost_price: 14000,
      cash_price: 17000,
      installment_price: 19000,
      min_stock: 2,
      max_stock: 20,
      warranty_months: 24,
      serial_required: true,
    },
    {
      name: "غسالة تورنيدو 10 كيلو",
      brand: "تورنيدو",
      model: "TWF-10",
      category: "أجهزة كهربائية",
      unit: "قطعة",
      cost_price: 9000,
      cash_price: 11000,
      installment_price: 12500,
      min_stock: 2,
      max_stock: 15,
      warranty_months: 12,
      serial_required: true,
    },
    {
      name: "تكييف شارب 1.5 حصان",
      brand: "شارب",
      model: "AY-A12",
      category: "أجهزة كهربائية",
      unit: "قطعة",
      cost_price: 10500,
      cash_price: 13000,
      installment_price: 14500,
      min_stock: 2,
      max_stock: 12,
      warranty_months: 12,
      serial_required: true,
    },
    {
      name: "بوتاجاز تورنيدو 5 شعلة",
      brand: "تورنيدو",
      model: "TGC-5B",
      category: "أجهزة منزلية",
      unit: "قطعة",
      cost_price: 3200,
      cash_price: 4000,
      installment_price: 4500,
      min_stock: 3,
      max_stock: 25,
      warranty_months: 12,
      serial_required: false,
    },
    {
      name: "تلفزيون سامسونج 55 بوصة",
      brand: "سامسونج",
      model: "UA55",
      category: "أجهزة كهربائية",
      unit: "قطعة",
      cost_price: 9500,
      cash_price: 12000,
      installment_price: 13500,
      min_stock: 2,
      max_stock: 15,
      warranty_months: 24,
      serial_required: true,
    },
    {
      name: "مايكروويف شارب",
      brand: "شارب",
      model: "R-20",
      category: "أجهزة منزلية",
      unit: "قطعة",
      cost_price: 1800,
      cash_price: 2300,
      installment_price: 2600,
      min_stock: 3,
      max_stock: 20,
      warranty_months: 6,
      serial_required: false,
    },
    {
      name: "موبايل سامسونج A15",
      brand: "سامسونج",
      model: "A15",
      category: "موبايلات وإلكترونيات",
      unit: "قطعة",
      cost_price: 5200,
      cash_price: 6200,
      installment_price: 7000,
      min_stock: 3,
      max_stock: 20,
      warranty_months: 12,
      serial_required: true,
    },
  ];

  const products: SeededProduct[] = [];
  for (const draft of drafts) {
    const code = await nextTenantCode("products", tenantId, "PRD");
    const { data, error } = await supabase
      .from("products")
      .insert({ ...draft, tenant_id: tenantId, code, active: true })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء المنتج "${draft.name}": ${error.message}`);
    products.push({
      id: data.id as string,
      code,
      name: draft.name,
      serial_required: draft.serial_required,
      cost_price: draft.cost_price,
      cash_price: draft.cash_price,
      installment_price: draft.installment_price,
    });
  }
  console.log(`✓ ${products.length} منتجات`);
  return products;
}

/* ---------------- Step 3: treasury accounts (with opening balances) ---------------- */

interface TreasuryState {
  mainId: string;
  cashierId: string;
  balances: Map<string, number>;
}

async function seedTreasuryAccounts(tenantId: string): Promise<TreasuryState> {
  async function createAccount(
    name: string,
    kind: "main" | "cashier",
    opening: number,
  ): Promise<string> {
    const { data, error } = await supabase
      .from("treasury_accounts")
      .insert({ tenant_id: tenantId, name, kind, active: true, created_at: backdate(6, 1) })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء خزينة "${name}": ${error.message}`);
    const accountId = data.id as string;
    if (opening > 0) {
      const { error: movementError } = await supabase.from("treasury_movements").insert({
        tenant_id: tenantId,
        account_id: accountId,
        type: "opening",
        amount: opening,
        before: 0,
        after: opening,
        user_id: null,
        reference: "رصيد افتتاحي",
        created_at: backdate(6, 1),
      });
      if (movementError) throw new Error(`فشل ترحيل الرصيد الافتتاحي: ${movementError.message}`);
    }
    return accountId;
  }

  const mainId = await createAccount("الخزينة الرئيسية", "main", 20000);
  const cashierId = await createAccount("خزينة الكاشير", "cashier", 5000);
  console.log("✓ خزينتان (رئيسية + كاشير) برصيد افتتاحي");
  return {
    mainId,
    cashierId,
    balances: new Map([
      [mainId, 20000],
      [cashierId, 5000],
    ]),
  };
}

async function postTreasuryMovement(
  tenantId: string,
  treasury: TreasuryState,
  accountId: string,
  amount: number,
  type: string,
  reference: string | undefined,
  createdAt: string,
): Promise<void> {
  const before = treasury.balances.get(accountId) ?? 0;
  const after = round2(before + amount);
  const { error } = await supabase.from("treasury_movements").insert({
    tenant_id: tenantId,
    account_id: accountId,
    type,
    amount,
    before,
    after,
    user_id: null,
    ...(reference ? { reference } : {}),
    created_at: createdAt,
  });
  if (error) throw new Error(`فشل ترحيل حركة الخزينة: ${error.message}`);
  treasury.balances.set(accountId, after);
}

async function postJournalEntry(
  tenantId: string,
  lines: Array<{ account_code: string; account_name: string; debit: number; credit: number }>,
  description: string,
  referenceType: string,
  referenceId: string,
  createdAt: string,
): Promise<void> {
  const totalDebit = round2(lines.reduce((sum, l) => sum + l.debit, 0));
  const totalCredit = round2(lines.reduce((sum, l) => sum + l.credit, 0));
  if (totalDebit !== totalCredit) {
    throw new Error(`قيد غير متوازن (${description}): مدين ${totalDebit} ≠ دائن ${totalCredit}`);
  }
  const entry_number = await nextYearCode("journal_entries", "entry_number", tenantId, "JE");
  const { error } = await supabase.from("journal_entries").insert({
    tenant_id: tenantId,
    entry_number,
    lines,
    description,
    reference_type: referenceType,
    reference_id: referenceId,
    created_at: createdAt,
  });
  if (error) throw new Error(`فشل ترحيل القيد المحاسبي (${description}): ${error.message}`);
}

/* ---------------- Step 4: suppliers ---------------- */

interface SeededSupplier {
  id: string;
  name: string;
}

async function seedSuppliers(tenantId: string): Promise<SeededSupplier[]> {
  const drafts = [
    { name: "مؤسسة النور للأجهزة الكهربائية", phone: "01001234567", address: "القاهرة - العبور" },
    { name: "شركة الدلتا للتوريدات", phone: "01112345678", address: "المنصورة" },
  ];
  const suppliers: SeededSupplier[] = [];
  for (const draft of drafts) {
    const code = await nextTenantCode("suppliers", tenantId, "SUP");
    const { data, error } = await supabase
      .from("suppliers")
      .insert({ ...draft, tenant_id: tenantId, code, active: true, created_at: backdate(6, 1) })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء المورد "${draft.name}": ${error.message}`);
    suppliers.push({ id: data.id as string, name: draft.name });
  }
  console.log(`✓ ${suppliers.length} موردين`);
  return suppliers;
}

/* ---------------- Step 5: partners + funding ---------------- */

interface SeededPartner {
  id: string;
  name: string;
  profit_share_pct: number;
}

async function seedPartners(tenantId: string): Promise<SeededPartner[]> {
  const drafts = [
    { name: "محمود عبد الرحمن", phone: "01011122233", profit_share_pct: 50, funding: 50000 },
    { name: "سارة يوسف", phone: "01211122234", profit_share_pct: 40, funding: 30000 },
    { name: "كريم عادل", phone: "01511122235", profit_share_pct: 30, funding: 20000 },
  ];
  const partners: SeededPartner[] = [];
  for (const draft of drafts) {
    const code = await nextTenantCode("partners", tenantId, "PTR");
    const { data, error } = await supabase
      .from("partners")
      .insert({
        tenant_id: tenantId,
        code,
        name: draft.name,
        phone: draft.phone,
        profit_share_pct: draft.profit_share_pct,
        active: true,
        created_at: backdate(5, 5),
      })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء الشريك "${draft.name}": ${error.message}`);
    const partnerId = data.id as string;
    const { error: fundingError } = await supabase.from("partner_transactions").insert({
      tenant_id: tenantId,
      partner_id: partnerId,
      type: "funding",
      amount: draft.funding,
      cost_recovered: 0,
      profit_amount: 0,
      reason: "تمويل تأسيسي",
      user_id: null,
      created_at: backdate(5, 5),
    });
    if (fundingError)
      throw new Error(`فشل تسجيل تمويل الشريك "${draft.name}": ${fundingError.message}`);
    partners.push({ id: partnerId, name: draft.name, profit_share_pct: draft.profit_share_pct });
  }
  console.log(`✓ ${partners.length} شركاء + تمويل تأسيسي`);
  return partners;
}

/* ---------------- Step 6: customers ---------------- */

interface SeededCustomer {
  id: string;
  name: string;
}

async function seedCustomers(tenantId: string): Promise<SeededCustomer[]> {
  const drafts = [
    { name: "أحمد فتحي السيد", phone: "01023456789", address: "مدينة نصر - القاهرة" },
    { name: "منى عبد اللطيف", phone: "01133456780", address: "الهرم - الجيزة" },
    { name: "حسام الدين محمد", phone: "01243456781", address: "المعادي - القاهرة" },
    { name: "إيمان صلاح", phone: "01553456782", address: "شبرا الخيمة - القليوبية" },
    { name: "عمرو نبيل", phone: "01063456783", address: "طنطا - الغربية" },
    { name: "رانيا حمدي", phone: "01173456784", address: "الزقازيق - الشرقية" },
  ];
  const customers: SeededCustomer[] = [];
  for (let i = 0; i < drafts.length; i++) {
    const draft = drafts[i] as (typeof drafts)[number];
    const code = await nextTenantCode("customers", tenantId, "CUST");
    const { data, error } = await supabase
      .from("customers")
      .insert({
        ...draft,
        tenant_id: tenantId,
        code,
        status: "active",
        created_at: backdate(5 - Math.floor(i / 2), 10 + i),
      })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء العميل "${draft.name}": ${error.message}`);
    customers.push({ id: data.id as string, name: draft.name });
  }
  console.log(`✓ ${customers.length} عملاء`);
  return customers;
}

/* ---------------- Shared: stock/serial tracking + receive stock ---------------- */

interface StockState {
  /** لكل منتج مش سيريال — الكمية الحالية. */
  quantity: Map<string, number>;
  /** لكل منتج سيريال — قائمة السيريالات المتاحة حاليًا. */
  availableSerials: Map<string, Array<{ id: string; serial_number: string }>>;
  costPrice: Map<string, number>;
}

function newStockState(products: SeededProduct[]): StockState {
  const state: StockState = {
    quantity: new Map(),
    availableSerials: new Map(),
    costPrice: new Map(),
  };
  for (const p of products) {
    state.quantity.set(p.id, 0);
    state.availableSerials.set(p.id, []);
    state.costPrice.set(p.id, p.cost_price);
  }
  return state;
}

async function receiveStock(
  tenantId: string,
  stock: StockState,
  product: SeededProduct,
  quantity: number,
  unitCost: number,
  reference: string,
  createdAt: string,
): Promise<void> {
  if (product.serial_required) {
    const serials = Array.from({ length: quantity }, (_, i) => ({
      serial_number: `${product.code}-${Date.now().toString(36).toUpperCase()}${i}`,
    }));
    const before = (stock.availableSerials.get(product.id) ?? []).length;
    const after = before + quantity;
    const { data, error } = await supabase
      .from("product_serials")
      .insert(
        serials.map((s) => ({
          tenant_id: tenantId,
          product_id: product.id,
          serial_number: s.serial_number,
          status: "available",
        })),
      )
      .select();
    if (error) throw new Error(`فشل تسجيل سيريالات "${product.name}": ${error.message}`);
    const created = (data ?? []) as Array<{ id: string; serial_number: string }>;
    stock.availableSerials.set(product.id, [
      ...(stock.availableSerials.get(product.id) ?? []),
      ...created.map((c) => ({ id: c.id, serial_number: c.serial_number })),
    ]);
    const { error: movementError } = await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      product_id: product.id,
      type: "receipt",
      quantity,
      before,
      after,
      user_id: null,
      reference,
      created_at: createdAt,
    });
    if (movementError)
      throw new Error(`فشل ترحيل حركة استلام "${product.name}": ${movementError.message}`);
  } else {
    const before = stock.quantity.get(product.id) ?? 0;
    const after = before + quantity;
    stock.quantity.set(product.id, after);
    const { error: movementError } = await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      product_id: product.id,
      type: "receipt",
      quantity,
      before,
      after,
      user_id: null,
      reference,
      created_at: createdAt,
    });
    if (movementError)
      throw new Error(`فشل ترحيل حركة استلام "${product.name}": ${movementError.message}`);
  }

  // Weighted-average cost, mirroring performReceiveStock's default costing method.
  const priorCost = stock.costPrice.get(product.id) ?? unitCost;
  const priorQty = product.serial_required
    ? (stock.availableSerials.get(product.id) ?? []).length - quantity
    : (stock.quantity.get(product.id) ?? 0) - quantity;
  const newCost =
    priorQty + quantity > 0
      ? round2((priorQty * priorCost + quantity * unitCost) / (priorQty + quantity))
      : unitCost;
  stock.costPrice.set(product.id, newCost);
  const { error: costError } = await supabase
    .from("products")
    .update({ cost_price: newCost })
    .eq("id", product.id);
  if (costError) throw new Error(`فشل تحديث تكلفة "${product.name}": ${costError.message}`);
}

interface SoldLine {
  product_id: string;
  product_name: string;
  serial_id?: string;
  serial_number?: string;
  quantity: number;
  unit_price: number;
  line_total: number;
}

function sellFromStock(
  stock: StockState,
  product: SeededProduct,
  quantity: number,
  unitPrice: number,
): { line: SoldLine; serialSoldId?: string } {
  if (product.serial_required) {
    const available = stock.availableSerials.get(product.id) ?? [];
    const picked = available[0];
    if (!picked) throw new Error(`لا يوجد مخزون متاح لمنتج "${product.name}"`);
    stock.availableSerials.set(product.id, available.slice(1));
    return {
      line: {
        product_id: product.id,
        product_name: product.name,
        serial_id: picked.id,
        serial_number: picked.serial_number,
        quantity: 1,
        unit_price: unitPrice,
        line_total: unitPrice,
      },
      serialSoldId: picked.id,
    };
  }
  const before = stock.quantity.get(product.id) ?? 0;
  if (before < quantity) throw new Error(`مخزون غير كافٍ لمنتج "${product.name}"`);
  stock.quantity.set(product.id, before - quantity);
  return {
    line: {
      product_id: product.id,
      product_name: product.name,
      quantity,
      unit_price: unitPrice,
      line_total: round2(unitPrice * quantity),
    },
  };
}

async function insertSaleInventoryMovement(
  tenantId: string,
  stock: StockState,
  product: SeededProduct,
  quantitySold: number,
  reference: string,
  createdAt: string,
): Promise<void> {
  const currentAvailable = product.serial_required
    ? (stock.availableSerials.get(product.id) ?? []).length
    : (stock.quantity.get(product.id) ?? 0);
  const before = currentAvailable + quantitySold;
  const after = currentAvailable;
  const { error } = await supabase.from("inventory_movements").insert({
    tenant_id: tenantId,
    product_id: product.id,
    type: "sale",
    quantity: -quantitySold,
    before,
    after,
    user_id: null,
    reference,
    created_at: createdAt,
  });
  if (error) throw new Error(`فشل ترحيل حركة بيع "${product.name}": ${error.message}`);
}

/* ---------------- Step 7: purchases ---------------- */

async function seedPurchases(
  tenantId: string,
  suppliers: SeededSupplier[],
  products: SeededProduct[],
  stock: StockState,
  treasury: TreasuryState,
): Promise<void> {
  const byName = (name: string) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`منتج غير موجود بالاسم "${name}" (خطأ داخلي في السكريبت)`);
    return p;
  };

  const plans: Array<{
    supplier: SeededSupplier;
    monthsAgo: number;
    day: number;
    items: Array<{ product: SeededProduct; quantity: number; unitCost: number }>;
    immediatePayment?: number;
  }> = [
    {
      supplier: suppliers[0] as SeededSupplier,
      monthsAgo: 5,
      day: 8,
      items: [
        { product: byName("ثلاجة سامسونج 18 قدم"), quantity: 4, unitCost: 14000 },
        { product: byName("غسالة تورنيدو 10 كيلو"), quantity: 4, unitCost: 9000 },
      ],
      immediatePayment: 40000,
    },
    {
      supplier: suppliers[1] as SeededSupplier,
      monthsAgo: 4,
      day: 12,
      items: [
        { product: byName("تكييف شارب 1.5 حصان"), quantity: 3, unitCost: 10500 },
        { product: byName("بوتاجاز تورنيدو 5 شعلة"), quantity: 6, unitCost: 3200 },
      ],
    },
    {
      supplier: suppliers[0] as SeededSupplier,
      monthsAgo: 3,
      day: 6,
      items: [
        { product: byName("تلفزيون سامسونج 55 بوصة"), quantity: 3, unitCost: 9500 },
        { product: byName("موبايل سامسونج A15"), quantity: 5, unitCost: 5200 },
      ],
      immediatePayment: 30000,
    },
    {
      supplier: suppliers[1] as SeededSupplier,
      monthsAgo: 2,
      day: 15,
      items: [
        { product: byName("مايكروويف شارب"), quantity: 8, unitCost: 1800 },
        { product: byName("غسالة تورنيدو 10 كيلو"), quantity: 2, unitCost: 9100 },
      ],
    },
    {
      supplier: suppliers[0] as SeededSupplier,
      monthsAgo: 1,
      day: 4,
      items: [
        { product: byName("ثلاجة سامسونج 18 قدم"), quantity: 2, unitCost: 14200 },
        { product: byName("موبايل سامسونج A15"), quantity: 3, unitCost: 5250 },
      ],
      immediatePayment: 15000,
    },
  ];

  for (const plan of plans) {
    const createdAt = backdate(plan.monthsAgo, plan.day);
    const purchaseItems = plan.items.map((it) => ({
      product_id: it.product.id,
      product_name: it.product.name,
      serial_numbers: [] as string[],
      quantity: it.quantity,
      unit_cost: it.unitCost,
      line_total: round2(it.unitCost * it.quantity),
    }));
    const total = round2(purchaseItems.reduce((sum, i) => sum + i.line_total, 0));
    const purchase_number = await nextYearCode("purchases", "purchase_number", tenantId, "PUR");

    for (const it of plan.items) {
      await receiveStock(
        tenantId,
        stock,
        it.product,
        it.quantity,
        it.unitCost,
        purchase_number,
        createdAt,
      );
    }

    const { data: purchase, error } = await supabase
      .from("purchases")
      .insert({
        tenant_id: tenantId,
        purchase_number,
        supplier_id: plan.supplier.id,
        supplier_name: plan.supplier.name,
        items: purchaseItems,
        total,
        user_id: null,
        issue_date: createdAt.slice(0, 10),
        created_at: createdAt,
      })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء أمر شراء ${purchase_number}: ${error.message}`);

    await postJournalEntry(
      tenantId,
      [
        {
          account_code: "1200",
          account_name: ACCOUNT_NAMES["1200"] as string,
          debit: total,
          credit: 0,
        },
        {
          account_code: "2000",
          account_name: ACCOUNT_NAMES["2000"] as string,
          debit: 0,
          credit: total,
        },
      ],
      `أمر شراء ${purchase_number}`,
      "purchase",
      purchase.id as string,
      createdAt,
    );

    if (plan.immediatePayment) {
      const { data: payment, error: paymentError } = await supabase
        .from("supplier_payments")
        .insert({
          tenant_id: tenantId,
          supplier_id: plan.supplier.id,
          amount: plan.immediatePayment,
          user_id: null,
          created_at: createdAt,
        })
        .select()
        .single();
      if (paymentError) throw new Error(`فشل تسجيل دفعة مورد: ${paymentError.message}`);
      await postTreasuryMovement(
        tenantId,
        treasury,
        treasury.mainId,
        -plan.immediatePayment,
        "purchase_payment",
        purchase_number,
        createdAt,
      );
      await postJournalEntry(
        tenantId,
        [
          {
            account_code: "2000",
            account_name: ACCOUNT_NAMES["2000"] as string,
            debit: plan.immediatePayment,
            credit: 0,
          },
          {
            account_code: "1000",
            account_name: ACCOUNT_NAMES["1000"] as string,
            debit: 0,
            credit: plan.immediatePayment,
          },
        ],
        `دفعة فورية عند الشراء ${purchase_number}`,
        "supplier_payment",
        payment.id as string,
        createdAt,
      );
    }
  }
  console.log(`✓ ${plans.length} أوامر شراء (استلام مخزون + سيريالات + دفعات جزئية)`);
}

/* ---------------- Step 8: cash sales (some partner-funded) ---------------- */

async function settlePartnersForSale(
  tenantId: string,
  reference: string,
  saleId: string | undefined,
  contractId: string | undefined,
  cashSubtotal: number,
  cost: number,
  productId: string,
  partners: Array<{ partner: SeededPartner; splitPct: number }>,
  createdAt: string,
): Promise<void> {
  const rows = partners.map(({ partner, splitPct }) => {
    const shareOfCost = round2(cost * (splitPct / 100));
    const shareOfMargin = round2((cashSubtotal - cost) * (splitPct / 100));
    const profitAmount = round2(shareOfMargin * (partner.profit_share_pct / 100));
    return {
      tenant_id: tenantId,
      partner_id: partner.id,
      type: "sale_settlement",
      amount: profitAmount,
      cost_recovered: shareOfCost,
      profit_amount: profitAmount,
      deal_value: cashSubtotal,
      split_pct: splitPct,
      profit_share_pct_snapshot: partner.profit_share_pct,
      reference,
      ...(saleId ? { related_sale_id: saleId } : {}),
      ...(contractId ? { related_contract_id: contractId } : {}),
      related_product_id: productId,
      user_id: null,
      created_at: createdAt,
    };
  });
  const { error } = await supabase.from("partner_transactions").insert(rows);
  if (error) throw new Error(`فشل تسوية الشركاء لـ${reference}: ${error.message}`);
}

async function seedCashSales(
  tenantId: string,
  customers: SeededCustomer[],
  products: SeededProduct[],
  stock: StockState,
  treasury: TreasuryState,
  partners: SeededPartner[],
): Promise<void> {
  const byName = (name: string) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`منتج غير موجود بالاسم "${name}"`);
    return p;
  };

  const plans: Array<{
    customer: SeededCustomer;
    monthsAgo: number;
    day: number;
    items: Array<{ product: SeededProduct; quantity: number; unitPrice: number }>;
    fundedBy?: Array<{ partner: SeededPartner; splitPct: number }>;
  }> = [
    {
      customer: customers[0] as SeededCustomer,
      monthsAgo: 4,
      day: 20,
      items: [{ product: byName("بوتاجاز تورنيدو 5 شعلة"), quantity: 1, unitPrice: 4000 }],
    },
    {
      customer: customers[1] as SeededCustomer,
      monthsAgo: 3,
      day: 18,
      items: [{ product: byName("تلفزيون سامسونج 55 بوصة"), quantity: 1, unitPrice: 12000 }],
      fundedBy: [
        { partner: partners[0] as SeededPartner, splitPct: 60 },
        { partner: partners[1] as SeededPartner, splitPct: 40 },
      ],
    },
    {
      customer: customers[2] as SeededCustomer,
      monthsAgo: 2,
      day: 9,
      items: [
        { product: byName("مايكروويف شارب"), quantity: 1, unitPrice: 2300 },
        { product: byName("موبايل سامسونج A15"), quantity: 1, unitPrice: 6200 },
      ],
    },
    {
      customer: customers[3] as SeededCustomer,
      monthsAgo: 1,
      day: 22,
      items: [{ product: byName("تكييف شارب 1.5 حصان"), quantity: 1, unitPrice: 13000 }],
      fundedBy: [{ partner: partners[2] as SeededPartner, splitPct: 100 }],
    },
    {
      customer: customers[4] as SeededCustomer,
      monthsAgo: 0,
      day: new Date().getDate() > 5 ? new Date().getDate() - 4 : 1,
      items: [{ product: byName("موبايل سامسونج A15"), quantity: 1, unitPrice: 6200 }],
    },
  ];

  for (const plan of plans) {
    const createdAt = backdate(plan.monthsAgo, plan.day);
    const lines: SoldLine[] = [];
    for (const item of plan.items) {
      const { line } = sellFromStock(stock, item.product, item.quantity, item.unitPrice);
      lines.push(line);
    }
    const subtotal = round2(lines.reduce((sum, l) => sum + l.line_total, 0));
    const invoice_number = await nextYearCode("sales", "invoice_number", tenantId, "INV");

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        tenant_id: tenantId,
        invoice_number,
        customer_id: plan.customer.id,
        customer_name: plan.customer.name,
        items: lines,
        subtotal,
        discount_pct: 0,
        discount_amount: 0,
        total: subtotal,
        user_id: null,
        status: "completed",
        created_at: createdAt,
      })
      .select()
      .single();
    if (error) throw new Error(`فشل إنشاء فاتورة بيع: ${error.message}`);

    for (const soldLine of lines) {
      const product = products.find((p) => p.id === soldLine.product_id) as SeededProduct;
      await insertSaleInventoryMovement(
        tenantId,
        stock,
        product,
        soldLine.quantity,
        invoice_number,
        createdAt,
      );
      if (soldLine.serial_id) {
        const { error: serialError } = await supabase
          .from("product_serials")
          .update({ status: "sold" })
          .eq("id", soldLine.serial_id);
        if (serialError) throw new Error(`فشل تحديث حالة السيريال: ${serialError.message}`);
      }
    }

    await postTreasuryMovement(
      tenantId,
      treasury,
      treasury.cashierId,
      subtotal,
      "sale",
      invoice_number,
      createdAt,
    );
    await postJournalEntry(
      tenantId,
      [
        {
          account_code: "1000",
          account_name: ACCOUNT_NAMES["1000"] as string,
          debit: subtotal,
          credit: 0,
        },
        {
          account_code: "3000",
          account_name: ACCOUNT_NAMES["3000"] as string,
          debit: 0,
          credit: subtotal,
        },
      ],
      `بيع نقدي ${invoice_number}`,
      "sale",
      sale.id as string,
      createdAt,
    );

    if (plan.fundedBy && plan.fundedBy.length > 0) {
      const mainItem = plan.items[0] as (typeof plan.items)[number];
      const product = mainItem.product;
      await settlePartnersForSale(
        tenantId,
        invoice_number,
        sale.id as string,
        undefined,
        subtotal,
        product.cost_price * mainItem.quantity,
        product.id,
        plan.fundedBy,
        createdAt,
      );
    }
  }
  console.log(`✓ ${plans.length} فواتير بيع نقدي (بعضها بتمويل شركاء)`);
}

/* ---------------- Step 9: installment plans + contracts + payments ---------------- */

function calculateFinance(
  principal: number,
  ratePct: number,
): { financeAmount: number; totalAmount: number } {
  const financeAmount = round2(principal * (ratePct / 100));
  const totalAmount = round2(principal + financeAmount);
  return { financeAmount, totalAmount };
}

function generateSchedule(
  totalAmount: number,
  durationMonths: number,
  startDate: Date,
): Array<{ seq: number; due_date: string; amount: number }> {
  const base = Math.floor((totalAmount / durationMonths) * 100) / 100;
  const lines: Array<{ seq: number; due_date: string; amount: number }> = [];
  let allocated = 0;
  for (let i = 1; i <= durationMonths; i++) {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    const isLast = i === durationMonths;
    const amount = isLast ? round2(totalAmount - allocated) : base;
    allocated = round2(allocated + amount);
    lines.push({ seq: i, due_date: due.toISOString(), amount });
  }
  return lines;
}

async function seedInstallments(
  tenantId: string,
  customers: SeededCustomer[],
  products: SeededProduct[],
  stock: StockState,
  treasury: TreasuryState,
  partners: SeededPartner[],
): Promise<void> {
  const byName = (name: string) => {
    const p = products.find((x) => x.name === name);
    if (!p) throw new Error(`منتج غير موجود بالاسم "${name}"`);
    return p;
  };

  const { data: shortPlan, error: shortPlanError } = await supabase
    .from("installment_plans")
    .insert({
      tenant_id: tenantId,
      duration_months: 6,
      rate_pct: 12,
      active: true,
      created_at: backdate(5, 1),
    })
    .select()
    .single();
  if (shortPlanError) throw new Error(`فشل إنشاء خطة تقسيط قصيرة: ${shortPlanError.message}`);
  const { data: longPlan, error: longPlanError } = await supabase
    .from("installment_plans")
    .insert({
      tenant_id: tenantId,
      duration_months: 12,
      rate_pct: 20,
      active: true,
      created_at: backdate(5, 1),
    })
    .select()
    .single();
  if (longPlanError) throw new Error(`فشل إنشاء خطة تقسيط طويلة: ${longPlanError.message}`);
  console.log("✓ خطتا تقسيط (6 شهور @12% / 12 شهر @20%)");

  const plans: Array<{
    customer: SeededCustomer;
    monthsAgo: number;
    day: number;
    plan: { id: string; duration_months: number; rate_pct: number };
    item: { product: SeededProduct; unitPrice: number };
    downPayment: number;
    paymentsCount: number;
    fundedBy?: Array<{ partner: SeededPartner; splitPct: number }>;
  }> = [
    {
      customer: customers[1] as SeededCustomer,
      monthsAgo: 3,
      day: 25,
      plan: longPlan as { id: string; duration_months: number; rate_pct: number },
      item: { product: byName("ثلاجة سامسونج 18 قدم"), unitPrice: 17000 },
      downPayment: 3000,
      paymentsCount: 2,
      fundedBy: [{ partner: partners[0] as SeededPartner, splitPct: 100 }],
    },
    {
      customer: customers[3] as SeededCustomer,
      monthsAgo: 2,
      day: 5,
      plan: shortPlan as { id: string; duration_months: number; rate_pct: number },
      item: { product: byName("غسالة تورنيدو 10 كيلو"), unitPrice: 11000 },
      downPayment: 2000,
      paymentsCount: 1,
    },
    {
      customer: customers[5] as SeededCustomer,
      monthsAgo: 1,
      day: 10,
      plan: longPlan as { id: string; duration_months: number; rate_pct: number },
      item: { product: byName("موبايل سامسونج A15"), unitPrice: 6200 },
      downPayment: 1000,
      paymentsCount: 0,
      fundedBy: [
        { partner: partners[1] as SeededPartner, splitPct: 50 },
        { partner: partners[2] as SeededPartner, splitPct: 50 },
      ],
    },
  ];

  for (const plan of plans) {
    const createdAt = backdate(plan.monthsAgo, plan.day);
    const { line } = sellFromStock(stock, plan.item.product, 1, plan.item.unitPrice);
    const cashSubtotal = line.line_total;
    const principal = round2(cashSubtotal - plan.downPayment);
    const { financeAmount, totalAmount } = calculateFinance(principal, plan.plan.rate_pct);
    const schedule = generateSchedule(totalAmount, plan.plan.duration_months, new Date(createdAt));
    const contract_number = await nextYearCode(
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
        customer_id: plan.customer.id,
        customer_name: plan.customer.name,
        items: [line],
        cash_subtotal: cashSubtotal,
        down_payment: plan.downPayment,
        principal,
        plan_id: plan.plan.id,
        plan_duration_months: plan.plan.duration_months,
        plan_rate_pct: plan.plan.rate_pct,
        finance_amount: financeAmount,
        total_amount: totalAmount,
        installment_amount: schedule[0]?.amount ?? 0,
        status: "active",
        user_id: null,
        created_at: createdAt,
      })
      .select()
      .single();
    if (contractError) throw new Error(`فشل إنشاء عقد تقسيط: ${contractError.message}`);

    const { data: installmentRows, error: installmentsError } = await supabase
      .from("installments")
      .insert(
        schedule.map((s) => ({
          tenant_id: tenantId,
          contract_id: contract.id as string,
          seq: s.seq,
          due_date: s.due_date,
          amount: s.amount,
          paid_amount: 0,
          status: "scheduled",
        })),
      )
      .select();
    if (installmentsError) throw new Error(`فشل إنشاء جدول الأقساط: ${installmentsError.message}`);

    await insertSaleInventoryMovement(
      tenantId,
      stock,
      plan.item.product,
      1,
      contract_number,
      createdAt,
    );
    if (line.serial_id) {
      const { error: serialError } = await supabase
        .from("product_serials")
        .update({ status: "sold" })
        .eq("id", line.serial_id);
      if (serialError) throw new Error(`فشل تحديث حالة السيريال: ${serialError.message}`);
    }

    if (plan.downPayment > 0) {
      await postTreasuryMovement(
        tenantId,
        treasury,
        treasury.cashierId,
        plan.downPayment,
        "sale",
        contract_number,
        createdAt,
      );
    }
    await postJournalEntry(
      tenantId,
      [
        ...(plan.downPayment > 0
          ? [
              {
                account_code: "1000",
                account_name: ACCOUNT_NAMES["1000"] as string,
                debit: plan.downPayment,
                credit: 0,
              },
            ]
          : []),
        {
          account_code: "1100",
          account_name: ACCOUNT_NAMES["1100"] as string,
          debit: totalAmount,
          credit: 0,
        },
        {
          account_code: "3000",
          account_name: ACCOUNT_NAMES["3000"] as string,
          debit: 0,
          credit: cashSubtotal,
        },
        {
          account_code: "3100",
          account_name: ACCOUNT_NAMES["3100"] as string,
          debit: 0,
          credit: financeAmount,
        },
      ],
      `عقد تقسيط ${contract_number}`,
      "installment_contract",
      contract.id as string,
      createdAt,
    );

    if (plan.fundedBy && plan.fundedBy.length > 0) {
      await settlePartnersForSale(
        tenantId,
        contract_number,
        undefined,
        contract.id as string,
        cashSubtotal,
        plan.item.product.cost_price,
        plan.item.product.id,
        plan.fundedBy,
        createdAt,
      );
    }

    // تسجيل تحصيل أقساط (Oldest-Due-First) خلال الشهور اللي بعد تاريخ العقد.
    const rows = (installmentRows ?? []) as Array<{ id: string; seq: number; amount: number }>;
    const sorted = [...rows].sort((a, b) => a.seq - b.seq);
    for (let p = 0; p < plan.paymentsCount && p < sorted.length; p++) {
      const inst = sorted[p] as (typeof sorted)[number];
      const collectAt = backdate(Math.max(plan.monthsAgo - (p + 1), 0), Math.min(plan.day + 3, 27));
      const receipt_number = await nextYearCode(
        "installment_payments",
        "receipt_number",
        tenantId,
        "RCT",
      );
      const { data: payment, error: paymentError } = await supabase
        .from("installment_payments")
        .insert({
          tenant_id: tenantId,
          contract_id: contract.id as string,
          receipt_number,
          amount: inst.amount,
          allocations: [{ installment_id: inst.id, amount: inst.amount }],
          user_id: null,
          created_at: collectAt,
        })
        .select()
        .single();
      if (paymentError) throw new Error(`فشل تسجيل تحصيل قسط: ${paymentError.message}`);
      const { error: updateInstError } = await supabase
        .from("installments")
        .update({ paid_amount: inst.amount, status: "paid" })
        .eq("id", inst.id);
      if (updateInstError) throw new Error(`فشل تحديث حالة القسط: ${updateInstError.message}`);

      await postTreasuryMovement(
        tenantId,
        treasury,
        treasury.cashierId,
        inst.amount,
        "collection",
        receipt_number,
        collectAt,
      );
      await postJournalEntry(
        tenantId,
        [
          {
            account_code: "1000",
            account_name: ACCOUNT_NAMES["1000"] as string,
            debit: inst.amount,
            credit: 0,
          },
          {
            account_code: "1100",
            account_name: ACCOUNT_NAMES["1100"] as string,
            debit: 0,
            credit: inst.amount,
          },
        ],
        `تحصيل ${receipt_number}`,
        "installment_payment",
        payment.id as string,
        collectAt,
      );

      if (p === sorted.length - 1 || p === plan.paymentsCount - 1) {
        const allPaid = p + 1 >= sorted.length;
        if (allPaid) {
          const { error: statusError } = await supabase
            .from("installment_contracts")
            .update({ status: "settled" })
            .eq("id", contract.id as string);
          if (statusError) throw new Error(`فشل تحديث حالة العقد: ${statusError.message}`);
        } else {
          const { error: statusError } = await supabase
            .from("installment_contracts")
            .update({ status: "partially_paid" })
            .eq("id", contract.id as string);
          if (statusError) throw new Error(`فشل تحديث حالة العقد: ${statusError.message}`);
        }
      }
    }
  }
  console.log(`✓ ${plans.length} عقود تقسيط (جدول أقساط + تحصيلات جزئية)`);
}

/* ---------------- Step 10: expenses ---------------- */

async function seedExpenses(
  tenantId: string,
  treasury: TreasuryState,
  partners: SeededPartner[],
): Promise<void> {
  const drafts: Array<{
    monthsAgo: number;
    day: number;
    category: string;
    amount: number;
    reason: string;
    chargeTo: "treasury" | "partners";
    partnerIds?: string[];
  }> = [
    {
      monthsAgo: 4,
      day: 3,
      category: "إيجار",
      amount: 3500,
      reason: "إيجار المحل شهر 5",
      chargeTo: "treasury",
    },
    {
      monthsAgo: 3,
      day: 1,
      category: "كهرباء",
      amount: 850,
      reason: "فاتورة كهرباء المحل",
      chargeTo: "treasury",
    },
    {
      monthsAgo: 2,
      day: 20,
      category: "نقل وشحن",
      amount: 1200,
      reason: "نقل بضاعة من المورد للمخزن",
      chargeTo: "partners",
      partnerIds: [(partners[0] as SeededPartner).id, (partners[1] as SeededPartner).id],
    },
    {
      monthsAgo: 1,
      day: 12,
      category: "صيانة",
      amount: 600,
      reason: "صيانة سيارة التوصيل",
      chargeTo: "treasury",
    },
  ];

  for (const draft of drafts) {
    const createdAt = backdate(draft.monthsAgo, draft.day);
    const { data: expense, error } = await supabase
      .from("expenses")
      .insert({
        tenant_id: tenantId,
        account_id: draft.chargeTo === "treasury" ? treasury.mainId : null,
        charge_to: draft.chargeTo,
        category: draft.category,
        amount: draft.amount,
        reason: draft.reason,
        needs_approval: draft.amount > 2000,
        user_id: null,
        created_at: createdAt,
      })
      .select()
      .single();
    if (error) throw new Error(`فشل تسجيل مصروف "${draft.category}": ${error.message}`);

    if (draft.chargeTo === "partners" && draft.partnerIds && draft.partnerIds.length > 0) {
      const share = round2(draft.amount / draft.partnerIds.length);
      const { error: shareError } = await supabase.from("partner_transactions").insert(
        draft.partnerIds.map((partnerId) => ({
          tenant_id: tenantId,
          partner_id: partnerId,
          type: "expense_share",
          amount: -share,
          cost_recovered: 0,
          profit_amount: 0,
          reference: draft.category,
          reason: draft.reason,
          related_expense_id: expense.id as string,
          user_id: null,
          created_at: createdAt,
        })),
      );
      if (shareError) throw new Error(`فشل توزيع المصروف على الشركاء: ${shareError.message}`);
      continue;
    }

    await postTreasuryMovement(
      tenantId,
      treasury,
      treasury.mainId,
      -draft.amount,
      "expense",
      draft.category,
      createdAt,
    );
    await postJournalEntry(
      tenantId,
      [
        {
          account_code: "5000",
          account_name: ACCOUNT_NAMES["5000"] as string,
          debit: draft.amount,
          credit: 0,
        },
        {
          account_code: "1000",
          account_name: ACCOUNT_NAMES["1000"] as string,
          debit: 0,
          credit: draft.amount,
        },
      ],
      `مصروف: ${draft.category} — ${draft.reason}`,
      "expense",
      expense.id as string,
      createdAt,
    );
  }
  console.log(`✓ ${drafts.length} مصروفات (خزينة + شركاء)`);
}

/* ---------------- main ---------------- */

async function main() {
  console.log(`جارٍ البحث عن التينانت "${DEMO_TENANT_NAME}"...`);
  const tenantId = await resolveDemoTenantId();
  console.log(`✓ تم التأكد: تينانت واحد بالظبط — tenant_id = ${tenantId}`);

  await seedCategoriesAndBrands(tenantId);
  const products = await seedProducts(tenantId);
  const treasury = await seedTreasuryAccounts(tenantId);
  const suppliers = await seedSuppliers(tenantId);
  const partners = await seedPartners(tenantId);
  const customers = await seedCustomers(tenantId);

  const stock = newStockState(products);
  await seedPurchases(tenantId, suppliers, products, stock, treasury);
  await seedCashSales(tenantId, customers, products, stock, treasury, partners);
  await seedInstallments(tenantId, customers, products, stock, treasury, partners);
  await seedExpenses(tenantId, treasury, partners);

  console.log("");
  console.log('✅ تم بنجاح — بيانات ديمو كاملة اتسجّلت في تينانت "المتحدة جروب" بس.');
  console.log("افتح /platform وادخل على هذا التينانت (أو سجّل دخول بحسابه) للتأكد بصريًا.");
}

main().catch((e) => {
  console.error("❌ فشل السكريبت:", e instanceof Error ? e.message : e);
  process.exit(1);
});
