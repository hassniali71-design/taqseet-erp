/**
 * One-off admin utility: layers a LOT more realistic day-to-day activity onto the already-seeded
 * "المتحدة جروب" demo tenant — heavier, fairly-consistent volume across the last 5 months, PLUS a
 * full "today" worth of activity (fresh sales, an installment due today, an overdue installment
 * caught up today, a promise to pay, a same-day expense, a delivery in progress, partner funding
 * + a partner withdrawal, a return, and a stock adjustment) — so opening the app today shows a
 * living, busy shop across every module, not just a handful of quiet historical rows.
 *
 * This is purely ADDITIVE: it never deletes or resets anything, and it reuses the products,
 * customers, partners, suppliers, treasury accounts and installment plans that
 * `scripts/seed-demo-tenant.ts` already created — run that script FIRST if this tenant has no
 * base data yet (this script aborts with a clear error if it finds none).
 *
 * SAFETY: same hard gate as seed-demo-tenant.ts — resolves the tenant by the exact literal name
 * "المتحدة جروب" and refuses to write anything unless exactly one tenant matches. Never touch
 * this script's tenant name to point it at any other tenant (in particular the real operating
 * client's tenant).
 *
 * Not covered here (kept out on purpose, diminishing value for the added complexity): exchanges,
 * restructuring, early settlement, shift open/close. Everything else — sales, purchases,
 * installment contracts + collections + promises, returns, expenses (both treasury- and
 * partner-charged), deliveries, partner funding + withdrawal, and a manual stock adjustment — is
 * exercised at least once.
 *
 * Usage: bun run scripts/boost-demo-tenant-activity.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your local .env, same as every other script
 * here. Safe to re-run — it only ever adds more history and more "today" rows on top, it never
 * removes or resets what's already there.
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

/* ---------------- Small helpers (same style as seed-demo-tenant.ts) ---------------- */

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function backdate(monthsAgo: number, dayOffset = 0, hour = 11, minute = 0): string {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  d.setDate(d.getDate() + dayOffset);
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function daysAgo(n: number, hour = 11): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function todayAt(hour: number, minute = 0): string {
  const d = new Date();
  d.setHours(hour, minute, 0, 0);
  return d.toISOString();
}

function dateOnly(iso: string): string {
  return iso.slice(0, 10);
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
        `لقيت ${matches.length}. صفر كتابة حصلت.`,
    );
  }
  return (matches[0] as { id: string }).id;
}

/* ---------------- Step 2: load existing reference data ---------------- */

interface RefProduct {
  id: string;
  code: string;
  name: string;
  serial_required: boolean;
  cost_price: number;
  cash_price: number;
  installment_price: number;
}
interface RefCustomer {
  id: string;
  name: string;
}
interface RefPartner {
  id: string;
  name: string;
  profit_share_pct: number;
}
interface RefSupplier {
  id: string;
  name: string;
}
interface RefPlan {
  id: string;
  duration_months: number;
  rate_pct: number;
}

async function loadReferenceData(tenantId: string) {
  const [
    { data: products, error: productsError },
    { data: customers, error: customersError },
    { data: partners, error: partnersError },
    { data: suppliers, error: suppliersError },
    { data: accounts, error: accountsError },
    { data: plans, error: plansError },
  ] = await Promise.all([
    supabase.from("products").select("*").eq("tenant_id", tenantId).eq("active", true),
    supabase.from("customers").select("id, name").eq("tenant_id", tenantId).eq("status", "active"),
    supabase
      .from("partners")
      .select("id, name, profit_share_pct")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    supabase.from("suppliers").select("id, name").eq("tenant_id", tenantId).eq("active", true),
    supabase
      .from("treasury_accounts")
      .select("id, kind")
      .eq("tenant_id", tenantId)
      .eq("active", true),
    supabase
      .from("installment_plans")
      .select("id, duration_months, rate_pct")
      .eq("tenant_id", tenantId)
      .eq("active", true),
  ]);
  if (productsError) throw new Error(productsError.message);
  if (customersError) throw new Error(customersError.message);
  if (partnersError) throw new Error(partnersError.message);
  if (suppliersError) throw new Error(suppliersError.message);
  if (accountsError) throw new Error(accountsError.message);
  if (plansError) throw new Error(plansError.message);

  const products2 = (products ?? []) as RefProduct[];
  const customers2 = (customers ?? []) as RefCustomer[];
  const partners2 = (partners ?? []) as RefPartner[];
  const suppliers2 = (suppliers ?? []) as RefSupplier[];
  const accounts2 = (accounts ?? []) as Array<{ id: string; kind: string }>;
  const plans2 = (plans ?? []) as RefPlan[];

  if (products2.length === 0 || customers2.length === 0 || suppliers2.length === 0) {
    throw new Error(
      "التينانت ده لسه فاضي من بيانات أساسية (منتجات/عملاء/موردين) — شغّل scripts/seed-demo-tenant.ts الأول.",
    );
  }
  const cashierId = accounts2.find((a) => a.kind === "cashier")?.id ?? accounts2[0]?.id;
  const mainId = accounts2.find((a) => a.kind === "main")?.id ?? accounts2[0]?.id;
  if (!cashierId || !mainId) {
    throw new Error("مفيش خزينة كاشير/رئيسية نشطة — شغّل scripts/seed-demo-tenant.ts الأول.");
  }
  const shortPlan = [...plans2].sort((a, b) => a.duration_months - b.duration_months)[0];
  const longPlan = [...plans2].sort((a, b) => b.duration_months - a.duration_months)[0];
  if (!shortPlan || !longPlan) {
    throw new Error("مفيش خطط تقسيط نشطة — شغّل scripts/seed-demo-tenant.ts الأول.");
  }

  return {
    products: products2,
    customers: customers2,
    partners: partners2,
    suppliers: suppliers2,
    cashierId,
    mainId,
    shortPlan,
    longPlan,
  };
}

/* ---------------- Step 3: current stock / balances, read fresh from the DB ---------------- */

interface StockState {
  availableSerials: Map<string, Array<{ id: string; serial_number: string }>>;
  quantity: Map<string, number>;
}

async function loadCurrentStock(tenantId: string, products: RefProduct[]): Promise<StockState> {
  const [{ data: serials, error: serialsError }, { data: movements, error: movementsError }] =
    await Promise.all([
      supabase
        .from("product_serials")
        .select("id, product_id, serial_number, status")
        .eq("tenant_id", tenantId),
      supabase.from("inventory_movements").select("product_id, quantity").eq("tenant_id", tenantId),
    ]);
  if (serialsError) throw new Error(serialsError.message);
  if (movementsError) throw new Error(movementsError.message);

  const state: StockState = { availableSerials: new Map(), quantity: new Map() };
  for (const p of products) {
    if (p.serial_required) {
      const available = (serials ?? [])
        .filter((s) => s.product_id === p.id && s.status === "available")
        .map((s) => ({ id: s.id as string, serial_number: s.serial_number as string }));
      state.availableSerials.set(p.id, available);
    } else {
      const qty = (movements ?? [])
        .filter((m) => m.product_id === p.id)
        .reduce((sum, m) => sum + (m.quantity as number), 0);
      state.quantity.set(p.id, qty);
    }
  }
  return state;
}

async function receiveStock(
  tenantId: string,
  stock: StockState,
  product: RefProduct,
  quantity: number,
  reference: string,
  createdAt: string,
): Promise<void> {
  if (product.serial_required) {
    const before = (stock.availableSerials.get(product.id) ?? []).length;
    const serials = Array.from({ length: quantity }, (_, i) => ({
      serial_number: `${product.code}-B${Date.now().toString(36).toUpperCase()}${i}`,
    }));
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
      after: before + quantity,
      user_id: null,
      reference,
      created_at: createdAt,
    });
    if (movementError) throw new Error(movementError.message);
  } else {
    const before = stock.quantity.get(product.id) ?? 0;
    stock.quantity.set(product.id, before + quantity);
    const { error: movementError } = await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      product_id: product.id,
      type: "receipt",
      quantity,
      before,
      after: before + quantity,
      user_id: null,
      reference,
      created_at: createdAt,
    });
    if (movementError) throw new Error(movementError.message);
  }
}

/** Tops the product up first (self-healing) if there isn't enough available stock/serials. */
async function ensureStock(
  tenantId: string,
  stock: StockState,
  product: RefProduct,
  minQty: number,
  createdAt: string,
): Promise<void> {
  const have = product.serial_required
    ? (stock.availableSerials.get(product.id) ?? []).length
    : (stock.quantity.get(product.id) ?? 0);
  if (have < minQty) {
    await receiveStock(tenantId, stock, product, minQty - have + 2, "تعزيز مخزون", createdAt);
  }
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
  product: RefProduct,
  quantity: number,
  unitPrice: number,
): SoldLine {
  if (product.serial_required) {
    const available = stock.availableSerials.get(product.id) ?? [];
    const picked = available[0];
    if (!picked) throw new Error(`لا يوجد مخزون متاح لمنتج "${product.name}"`);
    stock.availableSerials.set(product.id, available.slice(1));
    return {
      product_id: product.id,
      product_name: product.name,
      serial_id: picked.id,
      serial_number: picked.serial_number,
      quantity: 1,
      unit_price: unitPrice,
      line_total: unitPrice,
    };
  }
  const before = stock.quantity.get(product.id) ?? 0;
  stock.quantity.set(product.id, before - quantity);
  return {
    product_id: product.id,
    product_name: product.name,
    quantity,
    unit_price: unitPrice,
    line_total: round2(unitPrice * quantity),
  };
}

async function insertSaleMovement(
  tenantId: string,
  stock: StockState,
  product: RefProduct,
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

/* ---------------- Treasury / journal ---------------- */

interface TreasuryState {
  balances: Map<string, number>;
}

async function loadTreasuryState(tenantId: string): Promise<TreasuryState> {
  const { data, error } = await supabase
    .from("treasury_movements")
    .select("account_id, amount")
    .eq("tenant_id", tenantId);
  if (error) throw new Error(error.message);
  const balances = new Map<string, number>();
  for (const m of data ?? []) {
    const accId = m.account_id as string;
    balances.set(accId, round2((balances.get(accId) ?? 0) + (m.amount as number)));
  }
  return { balances };
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

function calculateFinance(principal: number, ratePct: number) {
  const financeAmount = round2(principal * (ratePct / 100));
  const totalAmount = round2(principal + financeAmount);
  return { financeAmount, totalAmount };
}

function generateSchedule(totalAmount: number, durationMonths: number, startDate: Date) {
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

/* ---------------- Historical top-up: purchases + cash sales + installment contracts + expenses ---------------- */

async function boostHistory(
  tenantId: string,
  ref: Awaited<ReturnType<typeof loadReferenceData>>,
  stock: StockState,
  treasury: TreasuryState,
): Promise<{ unpaidContractIds: string[] }> {
  const { products, customers, suppliers, partners, cashierId, mainId, shortPlan, longPlan } = ref;
  const unpaidContractIds: string[] = [];

  for (let m = 0; m < 5; m++) {
    const monthsAgo = 5 - m;
    const createdAt = backdate(monthsAgo, 2 + m);

    // أمر شراء الشهر ده — تعزيز مخزون من مورد بالتناوب
    const supplier = suppliers[m % suppliers.length] as RefSupplier;
    const restockProduct = products[m % products.length] as RefProduct;
    const restockQty = restockProduct.serial_required ? 3 : 8;
    await ensureStock(tenantId, stock, restockProduct, 0, createdAt);
    await receiveStock(tenantId, stock, restockProduct, restockQty, `تعزيز شهري`, createdAt);
    const purchaseTotal = round2(restockProduct.cost_price * restockQty);
    const purchase_number = await nextYearCode("purchases", "purchase_number", tenantId, "PUR");
    const { data: purchase, error: purchaseError } = await supabase
      .from("purchases")
      .insert({
        tenant_id: tenantId,
        purchase_number,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        items: [
          {
            product_id: restockProduct.id,
            product_name: restockProduct.name,
            serial_numbers: [],
            quantity: restockQty,
            unit_cost: restockProduct.cost_price,
            line_total: purchaseTotal,
          },
        ],
        total: purchaseTotal,
        user_id: null,
        created_at: createdAt,
      })
      .select()
      .single();
    if (purchaseError) throw new Error(`فشل إنشاء أمر شراء شهري: ${purchaseError.message}`);
    await postJournalEntry(
      tenantId,
      [
        {
          account_code: "1200",
          account_name: ACCOUNT_NAMES["1200"] as string,
          debit: purchaseTotal,
          credit: 0,
        },
        {
          account_code: "2000",
          account_name: ACCOUNT_NAMES["2000"] as string,
          debit: 0,
          credit: purchaseTotal,
        },
      ],
      `أمر شراء ${purchase_number}`,
      "purchase",
      purchase.id as string,
      createdAt,
    );
    if (m % 2 === 0) {
      const payAmount = round2(purchaseTotal * 0.6);
      await postTreasuryMovement(
        tenantId,
        treasury,
        mainId,
        -payAmount,
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
            debit: payAmount,
            credit: 0,
          },
          {
            account_code: "1000",
            account_name: ACCOUNT_NAMES["1000"] as string,
            debit: 0,
            credit: payAmount,
          },
        ],
        `دفعة فورية عند الشراء ${purchase_number}`,
        "supplier_payment",
        purchase.id as string,
        createdAt,
      );
    }

    // 3 مبيعات نقدية الشهر ده
    for (let s = 0; s < 3; s++) {
      const saleAt = backdate(monthsAgo, 5 + s * 6);
      const customer = customers[(m + s) % customers.length] as RefCustomer;
      const product = products[(m + s + 1) % products.length] as RefProduct;
      await ensureStock(tenantId, stock, product, 1, saleAt);
      const line = sellFromStock(stock, product, 1, product.cash_price);
      const invoice_number = await nextYearCode("sales", "invoice_number", tenantId, "INV");
      const { data: sale, error } = await supabase
        .from("sales")
        .insert({
          tenant_id: tenantId,
          invoice_number,
          customer_id: customer.id,
          customer_name: customer.name,
          items: [line],
          subtotal: line.line_total,
          discount_pct: 0,
          discount_amount: 0,
          total: line.line_total,
          user_id: null,
          status: "completed",
          created_at: saleAt,
        })
        .select()
        .single();
      if (error) throw new Error(`فشل إنشاء بيع نقدي شهري: ${error.message}`);
      await insertSaleMovement(tenantId, stock, product, 1, invoice_number, saleAt);
      if (line.serial_id) {
        await supabase.from("product_serials").update({ status: "sold" }).eq("id", line.serial_id);
      }
      await postTreasuryMovement(
        tenantId,
        treasury,
        cashierId,
        line.line_total,
        "sale",
        invoice_number,
        saleAt,
      );
      await postJournalEntry(
        tenantId,
        [
          {
            account_code: "1000",
            account_name: ACCOUNT_NAMES["1000"] as string,
            debit: line.line_total,
            credit: 0,
          },
          {
            account_code: "3000",
            account_name: ACCOUNT_NAMES["3000"] as string,
            debit: 0,
            credit: line.line_total,
          },
        ],
        `بيع نقدي ${invoice_number}`,
        "sale",
        sale.id as string,
        saleAt,
      );
    }

    // عقد تقسيط الشهر ده
    const contractAt = backdate(monthsAgo, 10);
    const customer = customers[(m + 2) % customers.length] as RefCustomer;
    const product = products[(m + 3) % products.length] as RefProduct;
    const plan = m % 2 === 0 ? shortPlan : longPlan;
    await ensureStock(tenantId, stock, product, 1, contractAt);
    const line = sellFromStock(stock, product, 1, product.installment_price);
    const cashSubtotal = line.line_total;
    const downPayment = round2(cashSubtotal * 0.15);
    const principal = round2(cashSubtotal - downPayment);
    const { financeAmount, totalAmount } = calculateFinance(principal, plan.rate_pct);
    const schedule = generateSchedule(totalAmount, plan.duration_months, new Date(contractAt));
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
        customer_id: customer.id,
        customer_name: customer.name,
        items: [line],
        cash_subtotal: cashSubtotal,
        down_payment: downPayment,
        principal,
        plan_id: plan.id,
        plan_duration_months: plan.duration_months,
        plan_rate_pct: plan.rate_pct,
        finance_amount: financeAmount,
        total_amount: totalAmount,
        installment_amount: schedule[0]?.amount ?? 0,
        status: "active",
        user_id: null,
        created_at: contractAt,
      })
      .select()
      .single();
    if (contractError) throw new Error(`فشل إنشاء عقد تقسيط شهري: ${contractError.message}`);
    const { data: installmentRows, error: installmentsError } = await supabase
      .from("installments")
      .insert(
        schedule.map((sline) => ({
          tenant_id: tenantId,
          contract_id: contract.id as string,
          seq: sline.seq,
          due_date: sline.due_date,
          amount: sline.amount,
          paid_amount: 0,
          status: "scheduled",
        })),
      )
      .select();
    if (installmentsError) throw new Error(installmentsError.message);
    await insertSaleMovement(tenantId, stock, product, 1, contract_number, contractAt);
    if (line.serial_id) {
      await supabase.from("product_serials").update({ status: "sold" }).eq("id", line.serial_id);
    }
    if (downPayment > 0) {
      await postTreasuryMovement(
        tenantId,
        treasury,
        cashierId,
        downPayment,
        "sale",
        contract_number,
        contractAt,
      );
    }
    await postJournalEntry(
      tenantId,
      [
        ...(downPayment > 0
          ? [
              {
                account_code: "1000" as const,
                account_name: ACCOUNT_NAMES["1000"] as string,
                debit: downPayment,
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
      contractAt,
    );

    // شهرين (5 و3 من فوق) بيفضلوا من غير أي تحصيل عمدًا — عشان يبقى فيه متأخرات حقيقية
    if (monthsAgo === 5 || monthsAgo === 3) {
      unpaidContractIds.push(contract.id as string);
    } else {
      // تحصيل واحد على الوقت بعد حوالي شهر من تاريخ العقد
      const rows = (installmentRows ?? []) as Array<{ id: string; seq: number; amount: number }>;
      const first = [...rows].sort((a, b) => a.seq - b.seq)[0];
      if (first) {
        const collectAt = backdate(monthsAgo - 1, 12);
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
            amount: first.amount,
            allocations: [{ installment_id: first.id, amount: first.amount }],
            user_id: null,
            created_at: collectAt,
          })
          .select()
          .single();
        if (paymentError) throw new Error(paymentError.message);
        await supabase
          .from("installments")
          .update({ paid_amount: first.amount, status: "paid" })
          .eq("id", first.id);
        await supabase
          .from("installment_contracts")
          .update({ status: "partially_paid" })
          .eq("id", contract.id as string);
        await postTreasuryMovement(
          tenantId,
          treasury,
          cashierId,
          first.amount,
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
              debit: first.amount,
              credit: 0,
            },
            {
              account_code: "1100",
              account_name: ACCOUNT_NAMES["1100"] as string,
              debit: 0,
              credit: first.amount,
            },
          ],
          `تحصيل ${receipt_number}`,
          "installment_payment",
          payment.id as string,
          collectAt,
        );
      }
    }

    // مصروف الشهر ده — بالتبادل بين الخزينة والشركاء
    const expenseAt = backdate(monthsAgo, 18);
    const expenseAmount = 400 + m * 50;
    if (m % 2 === 0) {
      const { data: expense, error } = await supabase
        .from("expenses")
        .insert({
          tenant_id: tenantId,
          account_id: mainId,
          charge_to: "treasury",
          category: "إيجار ومرافق",
          amount: expenseAmount,
          reason: "مصروف تشغيل شهري",
          needs_approval: false,
          user_id: null,
          created_at: expenseAt,
        })
        .select()
        .single();
      if (error) throw new Error(error.message);
      await postTreasuryMovement(
        tenantId,
        treasury,
        mainId,
        -expenseAmount,
        "expense",
        "إيجار ومرافق",
        expenseAt,
      );
      await postJournalEntry(
        tenantId,
        [
          {
            account_code: "5000",
            account_name: ACCOUNT_NAMES["5000"] as string,
            debit: expenseAmount,
            credit: 0,
          },
          {
            account_code: "1000",
            account_name: ACCOUNT_NAMES["1000"] as string,
            debit: 0,
            credit: expenseAmount,
          },
        ],
        `مصروف: إيجار ومرافق`,
        "expense",
        expense.id as string,
        expenseAt,
      );
    } else if (partners.length > 0) {
      const partner = partners[m % partners.length] as RefPartner;
      await supabase.from("partner_transactions").insert({
        tenant_id: tenantId,
        partner_id: partner.id,
        type: "expense_share",
        amount: -expenseAmount,
        cost_recovered: 0,
        profit_amount: 0,
        reference: "نقل وشحن",
        reason: "مصروف تشغيل شهري على الشركاء",
        user_id: null,
        created_at: expenseAt,
      });
    }
  }

  return { unpaidContractIds };
}

/* ---------------- Today's activity ---------------- */

async function boostToday(
  tenantId: string,
  ref: Awaited<ReturnType<typeof loadReferenceData>>,
  stock: StockState,
  treasury: TreasuryState,
  unpaidContractIds: string[],
): Promise<void> {
  const { products, customers, partners, cashierId, shortPlan } = ref;

  // 1) بيعتين النهاردة — واحدة سيريال وواحدة بالكمية (عشان نرجّع واحدة منهم بعدين)
  const serialProduct = products.find((p) => p.serial_required) ?? products[0];
  const nonSerialProduct = products.find((p) => !p.serial_required) ?? products[1] ?? products[0];
  const saleAt1 = todayAt(10, 15);
  const saleAt2 = todayAt(12, 40);

  const customerA = customers[0] as RefCustomer;
  await ensureStock(tenantId, stock, serialProduct as RefProduct, 1, saleAt1);
  const lineA = sellFromStock(
    stock,
    serialProduct as RefProduct,
    1,
    (serialProduct as RefProduct).cash_price,
  );
  const invoiceA = await nextYearCode("sales", "invoice_number", tenantId, "INV");
  const { data: saleA, error: saleAError } = await supabase
    .from("sales")
    .insert({
      tenant_id: tenantId,
      invoice_number: invoiceA,
      customer_id: customerA.id,
      customer_name: customerA.name,
      items: [lineA],
      subtotal: lineA.line_total,
      discount_pct: 0,
      discount_amount: 0,
      total: lineA.line_total,
      user_id: null,
      status: "completed",
      created_at: saleAt1,
    })
    .select()
    .single();
  if (saleAError) throw new Error(saleAError.message);
  await insertSaleMovement(tenantId, stock, serialProduct as RefProduct, 1, invoiceA, saleAt1);
  if (lineA.serial_id) {
    await supabase.from("product_serials").update({ status: "sold" }).eq("id", lineA.serial_id);
  }
  await postTreasuryMovement(
    tenantId,
    treasury,
    cashierId,
    lineA.line_total,
    "sale",
    invoiceA,
    saleAt1,
  );
  await postJournalEntry(
    tenantId,
    [
      {
        account_code: "1000",
        account_name: ACCOUNT_NAMES["1000"] as string,
        debit: lineA.line_total,
        credit: 0,
      },
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"] as string,
        debit: 0,
        credit: lineA.line_total,
      },
    ],
    `بيع نقدي ${invoiceA}`,
    "sale",
    saleA.id as string,
    saleAt1,
  );

  const customerB = customers[1] as RefCustomer;
  await ensureStock(tenantId, stock, nonSerialProduct as RefProduct, 2, saleAt2);
  const lineB = sellFromStock(
    stock,
    nonSerialProduct as RefProduct,
    2,
    (nonSerialProduct as RefProduct).cash_price,
  );
  const invoiceB = await nextYearCode("sales", "invoice_number", tenantId, "INV");
  const { data: saleB, error: saleBError } = await supabase
    .from("sales")
    .insert({
      tenant_id: tenantId,
      invoice_number: invoiceB,
      customer_id: customerB.id,
      customer_name: customerB.name,
      items: [lineB],
      subtotal: lineB.line_total,
      discount_pct: 0,
      discount_amount: 0,
      total: lineB.line_total,
      user_id: null,
      status: "completed",
      created_at: saleAt2,
    })
    .select()
    .single();
  if (saleBError) throw new Error(saleBError.message);
  await insertSaleMovement(tenantId, stock, nonSerialProduct as RefProduct, 2, invoiceB, saleAt2);
  await postTreasuryMovement(
    tenantId,
    treasury,
    cashierId,
    lineB.line_total,
    "sale",
    invoiceB,
    saleAt2,
  );
  await postJournalEntry(
    tenantId,
    [
      {
        account_code: "1000",
        account_name: ACCOUNT_NAMES["1000"] as string,
        debit: lineB.line_total,
        credit: 0,
      },
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"] as string,
        debit: 0,
        credit: lineB.line_total,
      },
    ],
    `بيع نقدي ${invoiceB}`,
    "sale",
    saleB.id as string,
    saleAt2,
  );
  console.log(`✓ بيعان النهاردة (${invoiceA}, ${invoiceB})`);

  // 2) عقد تقسيط جديد من شهر بالظبط — أول قسط بيستحق النهاردة تقريبًا
  const oneMonthAgo = new Date();
  oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
  oneMonthAgo.setHours(9, 0, 0, 0);
  const contractAt = oneMonthAgo.toISOString();
  const customerC = customers[2] as RefCustomer;
  const contractProduct = products[4 % products.length] as RefProduct;
  await ensureStock(tenantId, stock, contractProduct, 1, contractAt);
  const lineC = sellFromStock(stock, contractProduct, 1, contractProduct.installment_price);
  const downPaymentC = round2(lineC.line_total * 0.15);
  const principalC = round2(lineC.line_total - downPaymentC);
  const { financeAmount: financeC, totalAmount: totalC } = calculateFinance(
    principalC,
    shortPlan.rate_pct,
  );
  const scheduleC = generateSchedule(totalC, shortPlan.duration_months, new Date(contractAt));
  const contractNumberC = await nextYearCode(
    "installment_contracts",
    "contract_number",
    tenantId,
    "CNT",
  );
  const { data: contractC, error: contractCError } = await supabase
    .from("installment_contracts")
    .insert({
      tenant_id: tenantId,
      contract_number: contractNumberC,
      customer_id: customerC.id,
      customer_name: customerC.name,
      items: [lineC],
      cash_subtotal: lineC.line_total,
      down_payment: downPaymentC,
      principal: principalC,
      plan_id: shortPlan.id,
      plan_duration_months: shortPlan.duration_months,
      plan_rate_pct: shortPlan.rate_pct,
      finance_amount: financeC,
      total_amount: totalC,
      installment_amount: scheduleC[0]?.amount ?? 0,
      status: "active",
      user_id: null,
      created_at: contractAt,
    })
    .select()
    .single();
  if (contractCError) throw new Error(contractCError.message);
  await supabase.from("installments").insert(
    scheduleC.map((sline) => ({
      tenant_id: tenantId,
      contract_id: contractC.id as string,
      seq: sline.seq,
      due_date: sline.due_date,
      amount: sline.amount,
      paid_amount: 0,
      status: "scheduled",
    })),
  );
  await insertSaleMovement(tenantId, stock, contractProduct, 1, contractNumberC, contractAt);
  if (lineC.serial_id) {
    await supabase.from("product_serials").update({ status: "sold" }).eq("id", lineC.serial_id);
  }
  if (downPaymentC > 0) {
    await postTreasuryMovement(
      tenantId,
      treasury,
      cashierId,
      downPaymentC,
      "sale",
      contractNumberC,
      contractAt,
    );
  }
  await postJournalEntry(
    tenantId,
    [
      ...(downPaymentC > 0
        ? [
            {
              account_code: "1000" as const,
              account_name: ACCOUNT_NAMES["1000"] as string,
              debit: downPaymentC,
              credit: 0,
            },
          ]
        : []),
      {
        account_code: "1100",
        account_name: ACCOUNT_NAMES["1100"] as string,
        debit: totalC,
        credit: 0,
      },
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"] as string,
        debit: 0,
        credit: lineC.line_total,
      },
      {
        account_code: "3100",
        account_name: ACCOUNT_NAMES["3100"] as string,
        debit: 0,
        credit: financeC,
      },
    ],
    `عقد تقسيط ${contractNumberC}`,
    "installment_contract",
    contractC.id as string,
    contractAt,
  );
  console.log(`✓ عقد تقسيط جديد (${contractNumberC}) — أول قسط بيستحق حوالي النهاردة`);

  // 3) هات القسط المتأخر ده الحق فيه — تحصيل النهاردة على أقدم عقد متروك من غير تحصيل
  const caughtUpContractId = unpaidContractIds[0];
  if (caughtUpContractId) {
    const { data: rows, error } = await supabase
      .from("installments")
      .select("id, seq, amount, paid_amount")
      .eq("contract_id", caughtUpContractId)
      .order("seq", { ascending: true });
    if (error) throw new Error(error.message);
    const oldest = (rows ?? []).find((r) => (r.paid_amount as number) < (r.amount as number));
    if (oldest) {
      const collectAt = todayAt(16, 5);
      const amount = oldest.amount as number;
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
          contract_id: caughtUpContractId,
          receipt_number,
          amount,
          allocations: [{ installment_id: oldest.id as string, amount }],
          user_id: null,
          created_at: collectAt,
        })
        .select()
        .single();
      if (paymentError) throw new Error(paymentError.message);
      await supabase
        .from("installments")
        .update({ paid_amount: amount, status: "paid" })
        .eq("id", oldest.id as string);
      await supabase
        .from("installment_contracts")
        .update({ status: "partially_paid" })
        .eq("id", caughtUpContractId);
      await postTreasuryMovement(
        tenantId,
        treasury,
        cashierId,
        amount,
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
            debit: amount,
            credit: 0,
          },
          {
            account_code: "1100",
            account_name: ACCOUNT_NAMES["1100"] as string,
            debit: 0,
            credit: amount,
          },
        ],
        `تحصيل ${receipt_number}`,
        "installment_payment",
        payment.id as string,
        collectAt,
      );
      console.log(`✓ اتحصّل النهاردة على قسط كان متأخر (إيصال ${receipt_number})`);
    }
  }

  // 4) وعد بالدفع النهاردة على العقد المتأخر التاني اللي لسه من غير تحصيل
  const stillOverdueContractId = unpaidContractIds[1];
  if (stillOverdueContractId) {
    const { data: contract } = await supabase
      .from("installment_contracts")
      .select("total_amount")
      .eq("id", stillOverdueContractId)
      .single();
    const promiseDate = new Date();
    promiseDate.setDate(promiseDate.getDate() + 3);
    await supabase.from("promises_to_pay").insert({
      tenant_id: tenantId,
      contract_id: stillOverdueContractId,
      promise_date: promiseDate.toISOString(),
      expected_amount: contract?.total_amount ?? 500,
      notes: "العميل اتصل ووعد يدفع الأسبوع ده",
      user_id: null,
      status: "pending",
      created_at: todayAt(11, 0),
    });
    console.log("✓ وعد بالدفع اتسجّل النهاردة على عقد متأخر");
  }

  // 5) مصروف طلع دلوقتي
  const { data: expenseToday, error: expenseTodayError } = await supabase
    .from("expenses")
    .insert({
      tenant_id: tenantId,
      account_id: ref.mainId,
      charge_to: "treasury",
      category: "صيانة",
      amount: 350,
      reason: "إصلاح مكيف الكاشير طلع فجأة النهاردة",
      needs_approval: false,
      user_id: null,
      created_at: todayAt(13, 30),
    })
    .select()
    .single();
  if (expenseTodayError) throw new Error(expenseTodayError.message);
  await postTreasuryMovement(
    tenantId,
    treasury,
    ref.mainId,
    -350,
    "expense",
    "صيانة",
    todayAt(13, 30),
  );
  await postJournalEntry(
    tenantId,
    [
      {
        account_code: "5000",
        account_name: ACCOUNT_NAMES["5000"] as string,
        debit: 350,
        credit: 0,
      },
      {
        account_code: "1000",
        account_name: ACCOUNT_NAMES["1000"] as string,
        debit: 0,
        credit: 350,
      },
    ],
    "مصروف: صيانة",
    "expense",
    expenseToday.id as string,
    todayAt(13, 30),
  );
  console.log("✓ مصروف صيانة اتسجّل النهاردة");

  // 6) أوردر توصيل من كام يوم لسه ماشي
  await supabase.from("delivery_orders").insert({
    tenant_id: tenantId,
    sale_id: saleB.id as string,
    customer_name: customerB.name,
    address: "عنوان العميل المسجّل",
    scheduled_date: dateOnly(daysAgo(3)),
    status: "out_for_delivery",
    user_id: null,
    created_at: daysAgo(3),
  });
  console.log("✓ أوردر توصيل شغّال من 3 أيام");

  // 7) تمويل شريك (دخول) + سحب شريك (خروج) النهاردة
  if (partners.length > 0) {
    const funder = partners[0] as RefPartner;
    await supabase.from("partner_transactions").insert({
      tenant_id: tenantId,
      partner_id: funder.id,
      type: "funding",
      amount: 10000,
      cost_recovered: 0,
      profit_amount: 0,
      reason: "تمويل إضافي النهاردة",
      user_id: null,
      created_at: todayAt(9, 30),
    });
    console.log(`✓ تمويل جديد من الشريك ${funder.name}`);

    if (partners.length > 1) {
      const withdrawer = partners[1] as RefPartner;
      const { data: txs } = await supabase
        .from("partner_transactions")
        .select("amount")
        .eq("partner_id", withdrawer.id);
      const balance = round2((txs ?? []).reduce((sum, t) => sum + (t.amount as number), 0));
      const withdrawAmount = Math.min(1000, Math.max(0, balance));
      if (withdrawAmount > 0) {
        await supabase.from("partner_transactions").insert({
          tenant_id: tenantId,
          partner_id: withdrawer.id,
          type: "withdrawal",
          amount: -withdrawAmount,
          cost_recovered: 0,
          profit_amount: 0,
          reason: "سحب جزء من رصيده النهاردة",
          user_id: null,
          created_at: todayAt(14, 0),
        });
        console.log(`✓ سحب رصيد من الشريك ${withdrawer.name}`);
      }
    }
  }

  // 8) إرجاع صنف من إحدى فواتير النهاردة
  const returnAt = todayAt(17, 0);
  const returnQty = 1;
  const returnValue = round2((nonSerialProduct as RefProduct).cash_price * returnQty);
  const return_number = await nextYearCode("sale_returns", "return_number", tenantId, "RET");
  const beforeStock = stock.quantity.get((nonSerialProduct as RefProduct).id) ?? 0;
  await supabase.from("inventory_movements").insert({
    tenant_id: tenantId,
    product_id: (nonSerialProduct as RefProduct).id,
    type: "return",
    quantity: returnQty,
    before: beforeStock,
    after: beforeStock + returnQty,
    user_id: null,
    reference: return_number,
    created_at: returnAt,
  });
  stock.quantity.set((nonSerialProduct as RefProduct).id, beforeStock + returnQty);
  const { data: saleReturn, error: returnError } = await supabase
    .from("sale_returns")
    .insert({
      tenant_id: tenantId,
      return_number,
      sale_id: saleB.id as string,
      customer_id: customerB.id,
      customer_name: customerB.name,
      items: [
        {
          product_id: (nonSerialProduct as RefProduct).id,
          product_name: (nonSerialProduct as RefProduct).name,
          quantity: returnQty,
          unit_price: (nonSerialProduct as RefProduct).cash_price,
          line_total: returnValue,
        },
      ],
      refund_amount: returnValue,
      reason: "العميل غيّر رأيه بعد الشراء بساعات",
      user_id: null,
      created_at: returnAt,
    })
    .select()
    .single();
  if (returnError) throw new Error(returnError.message);
  await postTreasuryMovement(
    tenantId,
    treasury,
    cashierId,
    -returnValue,
    "return",
    return_number,
    returnAt,
  );
  await postJournalEntry(
    tenantId,
    [
      {
        account_code: "3000",
        account_name: ACCOUNT_NAMES["3000"] as string,
        debit: returnValue,
        credit: 0,
      },
      {
        account_code: "1000",
        account_name: ACCOUNT_NAMES["1000"] as string,
        debit: 0,
        credit: returnValue,
      },
    ],
    `مرتجع ${return_number}`,
    "sale_return",
    saleReturn.id as string,
    returnAt,
  );
  console.log(`✓ مرتجع النهاردة على فاتورة ${invoiceB} (${return_number})`);

  // 9) تسوية جرد بسيطة على صنف تاني
  const adjustProduct = products.find(
    (p) => !p.serial_required && p.id !== (nonSerialProduct as RefProduct).id,
  );
  if (adjustProduct) {
    const before = stock.quantity.get(adjustProduct.id) ?? 0;
    const diff = -1;
    await supabase.from("inventory_movements").insert({
      tenant_id: tenantId,
      product_id: adjustProduct.id,
      type: "adjustment",
      quantity: diff,
      before,
      after: before + diff,
      user_id: null,
      reason: "جرد دوري لقى فرق قطعة واحدة",
      created_at: todayAt(18, 0),
    });
    stock.quantity.set(adjustProduct.id, before + diff);
    console.log(`✓ تسوية جرد على "${adjustProduct.name}"`);
  }
}

/* ---------------- main ---------------- */

async function main() {
  console.log(`جارٍ البحث عن التينانت "${DEMO_TENANT_NAME}"...`);
  const tenantId = await resolveDemoTenantId();
  console.log(`✓ تم التأكد: تينانت واحد بالظبط — tenant_id = ${tenantId}`);

  const ref = await loadReferenceData(tenantId);
  const stock = await loadCurrentStock(tenantId, ref.products);
  const treasury = await loadTreasuryState(tenantId);

  console.log("جارٍ زيادة حركة الشهور الخمسة الماضية...");
  const { unpaidContractIds } = await boostHistory(tenantId, ref, stock, treasury);
  console.log(
    `✓ حركة الشهور الخمسة اتزودت (${unpaidContractIds.length} عقد اتسابوا من غير تحصيل عمدًا)`,
  );

  console.log("جارٍ إضافة حركة النهاردة...");
  await boostToday(tenantId, ref, stock, treasury, unpaidContractIds);

  console.log("");
  console.log('✅ تم بنجاح — تينانت "المتحدة جروب" دلوقتي فيه حركة تشغيلية كثيفة وحديثة.');
  console.log("افتح /dashboard و/collections و/notifications بحساب هذا التينانت للتأكد بصريًا.");
}

main().catch((e) => {
  console.error("❌ فشل السكريبت:", e instanceof Error ? e.message : e);
  process.exit(1);
});
