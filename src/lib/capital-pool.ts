/** بند 92 — «الشركاء = رأس مال المشروع» (partners_mode = 'capital_pool'). حسابات للعرض بس (مفيش
 * رقم بيتخزّن): رأس مال كل شريك = اللي حطه − اللي سحبه (قرار المالك)، ونسبته منه. والربح المقترح
 * للتوزيع = مكسب البيع في الفترة − المصروفات، ومحمد بيعدّل أي رقم قبل الصرف (قرار المالك). */
import type {
  InstallmentContract,
  JournalEntry,
  Partner,
  PartnerTransaction,
  Product,
  Sale,
} from "@/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PartnerCapital {
  partner: Partner;
  funded: number;
  withdrawn: number;
  capital: number;
  /** من 0 لـ 100 */
  sharePct: number;
}

export function computeCapitalShares(
  partners: Partner[],
  transactions: PartnerTransaction[],
): { rows: PartnerCapital[]; total: number } {
  const rows = partners.map((partner) => {
    const own = transactions.filter((t) => t.partner_id === partner.id);
    const funded = own.filter((t) => t.type === "funding").reduce((s, t) => s + t.amount, 0);
    const withdrawn = own
      .filter((t) => t.type === "withdrawal")
      .reduce((s, t) => s + Math.abs(t.amount), 0);
    return {
      partner,
      funded: r2(funded),
      withdrawn: r2(withdrawn),
      capital: r2(funded - withdrawn),
      sharePct: 0,
    };
  });
  const total = r2(rows.reduce((s, r) => s + Math.max(0, r.capital), 0));
  for (const r of rows) {
    r.sharePct = total > 0 ? Math.round((Math.max(0, r.capital) / total) * 10000) / 100 : 0;
  }
  return { rows, total };
}

export interface PeriodProfit {
  cashSales: number;
  cashCost: number;
  installmentSales: number;
  installmentCost: number;
  financeRevenue: number;
  expenses: number;
  net: number;
}

const inRange = (iso: string, from: Date, to: Date) => {
  const t = new Date(iso).getTime();
  return t >= from.getTime() && t <= to.getTime();
};

/** مكسب الفترة: (البيع الكاش − تكلفته) + (التقسيط بسعر الكاش − تكلفته) + إيراد التقسيط − المصروفات.
 * التكلفة بسعر تكلفة الصنف الحالي (تقريبي) — وعشان كده ده **اقتراح** محمد بيعدّله. */
export function computePeriodProfit(
  from: Date,
  to: Date,
  sales: Sale[],
  contracts: InstallmentContract[],
  journal: JournalEntry[],
  products: Product[],
): PeriodProfit {
  const cost = (items: Sale["items"]) =>
    items.reduce(
      (s, i) => s + (products.find((p) => p.id === i.product_id)?.cost_price ?? 0) * i.quantity,
      0,
    );
  const cash = sales.filter((s) => s.status === "completed" && inRange(s.created_at, from, to));
  const inst = contracts.filter((c) => c.status !== "cancelled" && inRange(c.created_at, from, to));
  const cashSales = r2(cash.reduce((s, x) => s + (x.total ?? 0), 0));
  const cashCost = r2(cash.reduce((s, x) => s + cost(x.items ?? []), 0));
  const installmentSales = r2(inst.reduce((s, c) => s + (c.cash_subtotal ?? 0), 0));
  const installmentCost = r2(inst.reduce((s, c) => s + cost(c.items ?? []), 0));
  const financeRevenue = r2(inst.reduce((s, c) => s + (c.finance_amount ?? 0), 0));
  const expenses = r2(
    journal
      .filter((e) => inRange(e.created_at, from, to))
      .reduce(
        (s, e) =>
          s +
          (e.lines ?? [])
            .filter((l) => l.account_code === "5000")
            .reduce((a, l) => a + (l.debit ?? 0), 0),
        0,
      ),
  );
  const net = r2(
    cashSales - cashCost + installmentSales - installmentCost + financeRevenue - expenses,
  );
  return { cashSales, cashCost, installmentSales, installmentCost, financeRevenue, expenses, net };
}

/** تقسيم مبلغ بالنسب، والفرق في القروش بيروح لآخر شريك عشان المجموع يطلع مظبوط. */
export function splitByShares(amount: number, rows: PartnerCapital[]): Record<string, number> {
  const out: Record<string, number> = {};
  const eligible = rows.filter((r) => r.sharePct > 0);
  let allocated = 0;
  eligible.forEach((r, i) => {
    const v = i === eligible.length - 1 ? r2(amount - allocated) : r2((amount * r.sharePct) / 100);
    out[r.partner.id] = v;
    allocated = r2(allocated + v);
  });
  return out;
}
