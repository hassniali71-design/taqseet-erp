/**
 * Seeds the demo tenant (DEMO_TENANT_ID, "مالك المحل" / owner@demo.local) with a realistic,
 * internally-consistent business history spread over the last ~90 days — categories, brands,
 * products with stock, customers, cash sales, installment contracts with a mix of paid/overdue
 * installments, suppliers, purchases, supplier payments, and expenses — each with matching
 * treasury movements and journal entries, so every dashboard/report card and the treasury
 * balance itself show real, non-zero, coherent numbers for a client demo.
 *
 * Run against an EMPTY demo tenant (right after Settings → "تصفير بيانات المحل", or on a
 * freshly-seeded one that's never had real data): it does not check for existing rows first,
 * so running it twice doubles everything.
 *
 * Usage: bun run scripts/seed-demo-data.ts
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY in your local .env (same ones used for
 * npm run dev's server functions) — this bypasses RLS on purpose, same as the app's own
 * service-role server functions.
 */
import { createClient } from "@supabase/supabase-js";

import { calculateFinance, generateSchedule } from "../src/lib/finance-engine";

const SUPABASE_URL = process.env["SUPABASE_URL"];
const SUPABASE_SERVICE_ROLE_KEY = process.env["SUPABASE_SERVICE_ROLE_KEY"];
if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY غير موجودين في .env");
  process.exit(1);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const TENANT_ID = "00000000-0000-0000-0000-000000000002";

const ACCOUNT_NAMES: Record<string, string> = {
  "1000": "الخزينة/النقدية",
  "1100": "عملاء (ذمم مدينة)",
  "1200": "المخزون",
  "2000": "موردون (ذمم دائنة)",
  "3000": "إيرادات المبيعات",
  "3100": "إيرادات التمويل",
  "5000": "المصروفات",
};

function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString();
}
function pad(n: number, width = 4): string {
  return String(n).padStart(width, "0");
}
function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)] as T;
}
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

async function insertJournalEntry(
  entryNumber: string,
  lines: Array<{ account_code: string; debit: number; credit: number }>,
  description: string,
  referenceType: string,
  referenceId: string,
  createdAt: string,
) {
  const fullLines = lines.map((l) => ({ ...l, account_name: ACCOUNT_NAMES[l.account_code] }));
  const { error } = await supabase.from("journal_entries").insert({
    tenant_id: TENANT_ID,
    entry_number: entryNumber,
    lines: fullLines,
    description,
    reference_type: referenceType,
    reference_id: referenceId,
    created_at: createdAt,
  });
  if (error) throw new Error(`journal_entries: ${error.message}`);
}

async function postTreasury(
  accountId: string,
  amount: number,
  type: string,
  reference: string,
  createdAt: string,
  runningBalance: Map<string, number>,
) {
  const before = runningBalance.get(accountId) ?? 0;
  const after = round2(before + amount);
  runningBalance.set(accountId, after);
  const { error } = await supabase.from("treasury_movements").insert({
    tenant_id: TENANT_ID,
    account_id: accountId,
    type,
    amount,
    before,
    after,
    reference,
    created_at: createdAt,
  });
  if (error) throw new Error(`treasury_movements: ${error.message}`);
}

async function main() {
  console.log("بدء زرع بيانات العرض التجريبي...");
  const balances = new Map<string, number>();
  let journalSeq = 1;
  const nextJournalNumber = () => `JE-${pad(journalSeq++)}`;

  // ---------- Categories / Brands ----------
  const categoryNames = ["ثلاجات ومجمدات", "غسالات", "تكييفات", "شاشات وتلفزيونات", "أجهزة مطبخ"];
  const { data: categories, error: catErr } = await supabase
    .from("product_categories")
    .insert(categoryNames.map((name) => ({ tenant_id: TENANT_ID, name, active: true })))
    .select();
  if (catErr) throw new Error(`product_categories: ${catErr.message}`);

  const brandNames = ["توشيبا", "شارب", "سامسونج", "LG", "كريازي", "فريش"];
  const { error: brandErr } = await supabase
    .from("product_brands")
    .insert(brandNames.map((name) => ({ tenant_id: TENANT_ID, name, active: true })));
  if (brandErr) throw new Error(`product_brands: ${brandErr.message}`);
  console.log(`✓ ${categoryNames.length} فئات، ${brandNames.length} ماركات`);

  // ---------- Products ----------
  const productDefs = [
    { name: "ثلاجة نو فروست 16 قدم", brand: "توشيبا", cat: 0, cash: 18500, inst: 21500, stock: 6 },
    { name: "ثلاجة 14 قدم", brand: "كريازي", cat: 0, cash: 14200, inst: 16800, stock: 5 },
    { name: "غسالة أوتوماتيك 9 كيلو", brand: "LG", cat: 1, cash: 12900, inst: 15200, stock: 8 },
    { name: "غسالة نصف أوتوماتيك", brand: "فريش", cat: 1, cash: 5400, inst: 6300, stock: 10 },
    { name: "تكييف سبليت 1.5 حصان", brand: "شارب", cat: 2, cash: 16800, inst: 19900, stock: 7 },
    { name: "تكييف سبليت 2.25 حصان", brand: "شارب", cat: 2, cash: 22500, inst: 26500, stock: 4 },
    { name: "شاشة LED 43 بوصة", brand: "سامسونج", cat: 3, cash: 9800, inst: 11500, stock: 9 },
    { name: "شاشة سمارت 55 بوصة", brand: "LG", cat: 3, cash: 17600, inst: 20800, stock: 5 },
    { name: "بوتاجاز 5 شعلة", brand: "فريش", cat: 4, cash: 6200, inst: 7300, stock: 8 },
    { name: "ميكروويف 25 لتر", brand: "شارب", cat: 4, cash: 3200, inst: 3800, stock: 12 },
    { name: "خلاط كهربائي", brand: "كريازي", cat: 4, cash: 850, inst: 1000, stock: 15 },
    { name: "مكواة بخار", brand: "توشيبا", cat: 4, cash: 620, inst: 720, stock: 14 },
  ];
  const products: {
    id: string;
    name: string;
    cash: number;
    inst: number;
    serialRequired: boolean;
  }[] = [];
  let productSeq = 1;
  for (const p of productDefs) {
    const serialRequired = p.cash > 3000; // small appliances go serial-less, big ones don't
    const { data, error } = await supabase
      .from("products")
      .insert({
        tenant_id: TENANT_ID,
        code: `PRD-${pad(productSeq++)}`,
        name: p.name,
        brand: p.brand,
        category: categories?.[p.cat]?.name,
        unit: "قطعة",
        cost_price: round2(p.cash * 0.78),
        cash_price: p.cash,
        installment_price: p.inst,
        min_stock: 2,
        max_stock: 30,
        serial_required: serialRequired,
        warranty_months: 12,
        active: true,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`products insert: ${error?.message}`);
    products.push({
      id: data.id as string,
      name: p.name,
      cash: p.cash,
      inst: p.inst,
      serialRequired,
    });

    // Opening stock
    if (serialRequired) {
      const serials = Array.from({ length: p.stock }, (_, i) => ({
        tenant_id: TENANT_ID,
        product_id: data.id as string,
        serial_number: `SN-${data.code as string}-${pad(i + 1, 3)}`,
        status: "available",
      }));
      const { error: sErr } = await supabase.from("product_serials").insert(serials);
      if (sErr) throw new Error(`product_serials: ${sErr.message}`);
    }
    const { error: mErr } = await supabase.from("inventory_movements").insert({
      tenant_id: TENANT_ID,
      product_id: data.id as string,
      type: "receipt",
      quantity: p.stock,
      before: 0,
      after: p.stock,
      reference: "رصيد افتتاحي",
      created_at: daysAgo(90),
    });
    if (mErr) throw new Error(`inventory_movements opening: ${mErr.message}`);
  }
  console.log(`✓ ${products.length} أجهزة برصيد افتتاحي`);

  // ---------- Treasury accounts ----------
  const { data: mainAccount, error: mainErr } = await supabase
    .from("treasury_accounts")
    .insert({ tenant_id: TENANT_ID, name: "الخزينة الرئيسية", kind: "main", active: true })
    .select()
    .single();
  if (mainErr || !mainAccount) throw new Error(`treasury_accounts main: ${mainErr?.message}`);
  const { data: cashierAccount, error: cashierErr } = await supabase
    .from("treasury_accounts")
    .insert({ tenant_id: TENANT_ID, name: "خزينة الكاشير", kind: "cashier", active: true })
    .select()
    .single();
  if (cashierErr || !cashierAccount)
    throw new Error(`treasury_accounts cashier: ${cashierErr?.message}`);
  await postTreasury(
    mainAccount.id as string,
    50000,
    "opening",
    "رصيد افتتاحي",
    daysAgo(90),
    balances,
  );
  await postTreasury(
    cashierAccount.id as string,
    5000,
    "opening",
    "رصيد افتتاحي",
    daysAgo(90),
    balances,
  );
  console.log("✓ خزينتين برصيد افتتاحي");

  // ---------- Customers ----------
  const customerNames = [
    "أحمد محمود السيد",
    "محمد عبد الرحمن",
    "منى إبراهيم فؤاد",
    "كريم حسن علي",
    "سارة وليد عبد العزيز",
    "عمرو صلاح الدين",
    "هبة الله محمد",
    "يوسف أشرف كمال",
    "نور الهدى سامي",
    "طارق عبد المنعم",
    "رانيا فتحي جاد",
    "مصطفى نبيل عزت",
  ];
  const customers: { id: string; name: string }[] = [];
  let custSeq = 1;
  for (const name of customerNames) {
    const { data, error } = await supabase
      .from("customers")
      .insert({
        tenant_id: TENANT_ID,
        code: `CUST-${pad(custSeq++)}`,
        name,
        phone: `01${pick(["0", "1", "2"])}${String(Math.floor(10000000 + Math.random() * 89999999))}`,
        address:
          pick(["مدينة نصر", "المعادي", "6 أكتوبر", "الهرم", "شبرا الخيمة", "الزقازيق"]) +
          "، القاهرة الكبرى",
        credit_limit: pick([15000, 20000, 25000, 30000]),
        status: "active",
        created_at: daysAgo(Math.floor(Math.random() * 80) + 5),
      })
      .select()
      .single();
    if (error || !data) throw new Error(`customers: ${error?.message}`);
    customers.push({ id: data.id as string, name });
  }
  console.log(`✓ ${customers.length} عملاء`);

  // ---------- Cash sales ----------
  let invoiceSeq = 1;
  const stockLeft = new Map(
    products.map((p) => [p.id, productDefs.find((d) => d.name === p.name)?.stock ?? 0]),
  );
  for (let i = 0; i < 18; i++) {
    const daysBack = Math.floor(Math.random() * 85) + 1;
    const createdAt = daysAgo(daysBack);
    const customer = pick(customers);
    const lineCount = Math.random() > 0.7 ? 2 : 1;
    const items: Array<{
      product_id: string;
      product_name: string;
      quantity: number;
      unit_price: number;
      line_total: number;
    }> = [];
    let subtotal = 0;
    const chosen = new Set<string>();
    for (let j = 0; j < lineCount; j++) {
      const product = pick(
        products.filter((p) => !chosen.has(p.id) && (stockLeft.get(p.id) ?? 0) > 0),
      );
      if (!product) continue;
      chosen.add(product.id);
      const qty = 1;
      items.push({
        product_id: product.id,
        product_name: product.name,
        quantity: qty,
        unit_price: product.cash,
        line_total: product.cash * qty,
      });
      subtotal += product.cash * qty;
      stockLeft.set(product.id, (stockLeft.get(product.id) ?? 0) - qty);
      await supabase.from("inventory_movements").insert({
        tenant_id: TENANT_ID,
        product_id: product.id,
        type: "sale",
        quantity: -qty,
        before: (stockLeft.get(product.id) ?? 0) + qty,
        after: stockLeft.get(product.id) ?? 0,
        reference: `INV-${pad(invoiceSeq)}`,
        created_at: createdAt,
      });
    }
    if (items.length === 0) continue;
    const discountPct = pick([0, 0, 0, 5]);
    const discountAmount = round2(subtotal * (discountPct / 100));
    const total = round2(subtotal - discountAmount);
    const invoiceNumber = `INV-${pad(invoiceSeq++)}`;
    const { data: sale, error: saleErr } = await supabase
      .from("sales")
      .insert({
        tenant_id: TENANT_ID,
        invoice_number: invoiceNumber,
        customer_id: customer.id,
        customer_name: customer.name,
        items,
        subtotal,
        discount_pct: discountPct,
        discount_amount: discountAmount,
        total,
        status: "completed",
        created_at: createdAt,
      })
      .select()
      .single();
    if (saleErr || !sale) throw new Error(`sales: ${saleErr?.message}`);
    await postTreasury(
      cashierAccount.id as string,
      total,
      "sale",
      invoiceNumber,
      createdAt,
      balances,
    );
    await insertJournalEntry(
      nextJournalNumber(),
      [
        { account_code: "1000", debit: total, credit: 0 },
        { account_code: "3000", debit: 0, credit: total },
      ],
      `بيع نقدي ${invoiceNumber}`,
      "sale",
      sale.id as string,
      createdAt,
    );
  }
  console.log(`✓ ${invoiceSeq - 1} فاتورة بيع نقدي`);

  // ---------- Installment plan + contracts ----------
  const { data: plan, error: planErr } = await supabase
    .from("installment_plans")
    .insert({ tenant_id: TENANT_ID, duration_months: 12, rate_pct: 25, active: true })
    .select()
    .single();
  if (planErr || !plan) throw new Error(`installment_plans: ${planErr?.message}`);

  let contractSeq = 1;
  let receiptSeq = 1;
  for (let i = 0; i < 8; i++) {
    const customer = pick(customers.filter((c) => c.name !== "مصطفى نبيل عزت" || i === 0));
    const product = pick(products.filter((p) => (stockLeft.get(p.id) ?? 0) > 0));
    if (!product) continue;
    stockLeft.set(product.id, (stockLeft.get(product.id) ?? 0) - 1);
    const daysBack = Math.floor(Math.random() * 75) + 10;
    const createdAt = daysAgo(daysBack);
    const cashSubtotal = product.inst;
    const downPayment = round2(cashSubtotal * 0.2);
    const principal = round2(cashSubtotal - downPayment);
    const { financeAmount, totalAmount } = calculateFinance(principal, plan.rate_pct as number);
    const schedule = generateSchedule(
      totalAmount,
      plan.duration_months as number,
      new Date(createdAt),
    );
    const installmentAmount = schedule[0]?.amount ?? 0;
    const contractNumber = `CNT-${pad(contractSeq++)}`;

    const { data: contract, error: contractErr } = await supabase
      .from("installment_contracts")
      .insert({
        tenant_id: TENANT_ID,
        contract_number: contractNumber,
        customer_id: customer.id,
        customer_name: customer.name,
        items: [
          {
            product_id: product.id,
            product_name: product.name,
            quantity: 1,
            unit_price: product.inst,
            line_total: product.inst,
          },
        ],
        cash_subtotal: cashSubtotal,
        down_payment: downPayment,
        principal,
        plan_id: plan.id,
        plan_duration_months: plan.duration_months,
        plan_rate_pct: plan.rate_pct,
        finance_amount: financeAmount,
        total_amount: totalAmount,
        installment_amount: installmentAmount,
        status: "active",
        created_at: createdAt,
      })
      .select()
      .single();
    if (contractErr || !contract) throw new Error(`installment_contracts: ${contractErr?.message}`);

    await supabase.from("inventory_movements").insert({
      tenant_id: TENANT_ID,
      product_id: product.id,
      type: "sale",
      quantity: -1,
      before: (stockLeft.get(product.id) ?? 0) + 1,
      after: stockLeft.get(product.id) ?? 0,
      reference: contractNumber,
      created_at: createdAt,
    });
    if (downPayment > 0) {
      await postTreasury(
        cashierAccount.id as string,
        downPayment,
        "sale",
        contractNumber,
        createdAt,
        balances,
      );
      await insertJournalEntry(
        nextJournalNumber(),
        [
          { account_code: "1000", debit: downPayment, credit: 0 },
          { account_code: "3000", debit: 0, credit: downPayment },
        ],
        `مقدّم عقد ${contractNumber}`,
        "installment_contract",
        contract.id as string,
        createdAt,
      );
    }

    // Insert the installment schedule; mark the first few as paid if the contract is old enough
    const monthsElapsed = Math.floor(daysBack / 30);
    const installmentRows: Array<{ id: string; seq: number; amount: number; due_date: string }> =
      [];
    for (const line of schedule) {
      const paidCount = Math.min(monthsElapsed, schedule.length);
      const isPaid = line.seq <= paidCount && Math.random() > 0.15; // a few stay unpaid/overdue on purpose
      const { data: instRow, error: instErr } = await supabase
        .from("installments")
        .insert({
          tenant_id: TENANT_ID,
          contract_id: contract.id,
          seq: line.seq,
          due_date: line.due_date,
          amount: line.amount,
          paid_amount: isPaid ? line.amount : 0,
          status: isPaid ? "paid" : "scheduled",
        })
        .select()
        .single();
      if (instErr || !instRow) throw new Error(`installments: ${instErr?.message}`);
      if (isPaid) {
        installmentRows.push({
          id: instRow.id as string,
          seq: line.seq,
          amount: line.amount,
          due_date: line.due_date,
        });
      }
    }

    // One collection receipt covering all paid installments so far (realistic: customer pays
    // monthly, receipts accumulate) — simplified here to one receipt per contract.
    if (installmentRows.length > 0) {
      const paidTotal = round2(installmentRows.reduce((s, r) => s + r.amount, 0));
      const receiptNumber = `RCT-${pad(receiptSeq++)}`;
      const collectedAt = daysAgo(Math.max(1, daysBack - installmentRows.length * 28));
      const { error: payErr } = await supabase.from("installment_payments").insert({
        tenant_id: TENANT_ID,
        contract_id: contract.id,
        receipt_number: receiptNumber,
        amount: paidTotal,
        allocations: installmentRows.map((r) => ({ installment_id: r.id, amount: r.amount })),
        created_at: collectedAt,
      });
      if (payErr) throw new Error(`installment_payments: ${payErr.message}`);
      await postTreasury(
        cashierAccount.id as string,
        paidTotal,
        "collection",
        receiptNumber,
        collectedAt,
        balances,
      );
      const financeShare = round2(paidTotal * (financeAmount / totalAmount));
      const principalShare = round2(paidTotal - financeShare);
      await insertJournalEntry(
        nextJournalNumber(),
        [
          { account_code: "1000", debit: paidTotal, credit: 0 },
          { account_code: "1100", debit: 0, credit: principalShare },
          { account_code: "3100", debit: 0, credit: financeShare },
        ],
        `تحصيل ${receiptNumber}`,
        "installment_payment",
        contract.id as string,
        collectedAt,
      );
    }
  }
  console.log(`✓ ${contractSeq - 1} عقد تقسيط بجداول وتحصيلات`);

  // ---------- Suppliers + purchases ----------
  const supplierNames = [
    "شركة النور للأجهزة الكهربائية",
    "مؤسسة الأمل للتوريدات",
    "الشرق الأوسط للتجارة",
  ];
  const suppliers: { id: string; name: string }[] = [];
  let supSeq = 1;
  for (const name of supplierNames) {
    const { data, error } = await supabase
      .from("suppliers")
      .insert({
        tenant_id: TENANT_ID,
        code: `SUP-${pad(supSeq++)}`,
        name,
        phone: `01${String(Math.floor(100000000 + Math.random() * 899999999))}`,
        active: true,
      })
      .select()
      .single();
    if (error || !data) throw new Error(`suppliers: ${error?.message}`);
    suppliers.push({ id: data.id as string, name });
  }
  let purchaseSeq = 1;
  for (let i = 0; i < 3; i++) {
    const supplier = pick(suppliers);
    const product = pick(products);
    const qty = pick([3, 4, 5]);
    const unitCost = round2(product.cash * 0.75);
    const total = round2(unitCost * qty);
    const createdAt = daysAgo(Math.floor(Math.random() * 70) + 15);
    const purchaseNumber = `PO-${pad(purchaseSeq++)}`;
    const { data: purchase, error: purchErr } = await supabase
      .from("purchases")
      .insert({
        tenant_id: TENANT_ID,
        purchase_number: purchaseNumber,
        supplier_id: supplier.id,
        supplier_name: supplier.name,
        items: [
          {
            product_id: product.id,
            product_name: product.name,
            quantity: qty,
            unit_cost: unitCost,
            line_total: total,
            serial_numbers: [],
          },
        ],
        total,
        issue_date: createdAt.slice(0, 10),
        created_at: createdAt,
      })
      .select()
      .single();
    if (purchErr || !purchase) throw new Error(`purchases: ${purchErr?.message}`);
    stockLeft.set(product.id, (stockLeft.get(product.id) ?? 0) + qty);
    await supabase.from("inventory_movements").insert({
      tenant_id: TENANT_ID,
      product_id: product.id,
      type: "receipt",
      quantity: qty,
      before: (stockLeft.get(product.id) ?? 0) - qty,
      after: stockLeft.get(product.id) ?? 0,
      reference: purchaseNumber,
      created_at: createdAt,
    });
    await postTreasury(
      mainAccount.id as string,
      -total,
      "purchase_payment",
      purchaseNumber,
      createdAt,
      balances,
    );
    await insertJournalEntry(
      nextJournalNumber(),
      [
        { account_code: "1200", debit: total, credit: 0 },
        { account_code: "1000", debit: 0, credit: total },
      ],
      `أمر شراء ${purchaseNumber}`,
      "purchase",
      purchase.id as string,
      createdAt,
    );
  }
  console.log(`✓ ${purchaseSeq - 1} أمر شراء`);

  // ---------- Expenses ----------
  const expenseDefs = [
    { category: "إيجار", amount: 8000 },
    { category: "كهرباء", amount: 1200 },
    { category: "صيانة", amount: 650 },
    { category: "نقل وتوصيل", amount: 900 },
  ];
  for (const exp of expenseDefs) {
    const createdAt = daysAgo(Math.floor(Math.random() * 60) + 5);
    const { data: expenseRow, error: expErr } = await supabase
      .from("expenses")
      .insert({
        tenant_id: TENANT_ID,
        account_id: mainAccount.id,
        category: exp.category,
        amount: exp.amount,
        reason: `مصروف ${exp.category} شهري`,
        needs_approval: false,
        created_at: createdAt,
      })
      .select()
      .single();
    if (expErr || !expenseRow) throw new Error(`expenses: ${expErr?.message}`);
    await postTreasury(
      mainAccount.id as string,
      -exp.amount,
      "expense",
      exp.category,
      createdAt,
      balances,
    );
    await insertJournalEntry(
      nextJournalNumber(),
      [
        { account_code: "5000", debit: exp.amount, credit: 0 },
        { account_code: "1000", debit: 0, credit: exp.amount },
      ],
      `مصروف ${exp.category}`,
      "expense",
      expenseRow.id as string,
      createdAt,
    );
  }
  console.log(`✓ ${expenseDefs.length} مصروفات`);

  console.log("\n✅ خلص الزرع بنجاح — العرض التجريبي جاهز.");
}

main().catch((e) => {
  console.error("❌ فشل الزرع:", e instanceof Error ? e.message : e);
  process.exit(1);
});
