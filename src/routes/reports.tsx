import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SalesTrendChart } from "@/components/ui/Charts";
import { SearchPicker } from "@/components/ui/SearchPicker";
import { Panel, StatCard } from "@/components/ui/StatCard";
import { CONTRACT_STATUS_LABEL } from "@/lib/contract-status";
import {
  computeAccountBalance,
  computeCustomerExposure,
  useCustomers,
  useInstallmentContracts,
  useInstallmentPayments,
  useInstallments,
  useJournalEntries,
  useProducts,
  usePurchases,
  useSaleReturns,
  useSales,
  useTreasuryAccounts,
  useTreasuryMovements,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import type { AccountCode } from "@/types";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Tab = "sales" | "contracts" | "statement" | "movement" | "financial" | "prices";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sales", label: "المبيعات" },
  { id: "contracts", label: "عقود التقسيط" },
  { id: "statement", label: "كشف حساب عميل" },
  { id: "movement", label: "حركة الأصناف" },
  { id: "financial", label: "التقرير المالي" },
  { id: "prices", label: "تحليل الأسعار" },
];

const ACCOUNT_LABELS: Record<AccountCode, string> = {
  "1000": "الخزينة/النقدية",
  "1100": "عملاء (ذمم مدينة)",
  "1200": "المخزون",
  "2000": "موردون (ذمم دائنة)",
  "3000": "إيرادات المبيعات",
  "3100": "إيرادات التمويل",
  "5000": "المصروفات",
};

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function ReportsPage() {
  const session = useRequireSession();
  const [tab, setTab] = useState<Tab>("sales");
  const [fromDate, setFromDate] = useState(() => daysAgo(30).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementCustomerId, setStatementCustomerId] = useState("");

  if (!session) return null;

  const from = new Date(fromDate).getTime();
  const to = new Date(toDate).getTime() + 24 * 60 * 60 * 1000 - 1;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">التقارير</h1>

        <div className="mt-4 flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                tab === t.id
                  ? "bg-primary text-primary-foreground"
                  : "border border-input text-foreground hover:bg-accent"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {(tab === "sales" || tab === "movement" || tab === "financial" || tab === "prices") && (
          <div className="mt-4 flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">من تاريخ</span>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">إلى تاريخ</span>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>
        )}

        {tab === "sales" && <SalesReport from={from} to={to} tenantId={session.tenant_id} />}
        {tab === "contracts" && <ContractsReport tenantId={session.tenant_id} />}
        {tab === "statement" && (
          <StatementReport
            customerId={statementCustomerId}
            onCustomerChange={setStatementCustomerId}
            tenantId={session.tenant_id}
          />
        )}
        {tab === "movement" && <MovementReport from={from} to={to} tenantId={session.tenant_id} />}
        {tab === "financial" && (
          <FinancialReport from={from} to={to} tenantId={session.tenant_id} />
        )}
        {tab === "prices" && (
          <PriceHistoryReport from={from} to={to} tenantId={session.tenant_id} />
        )}
      </main>
    </div>
  );
}

function SalesReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const { data: allSales = [] } = useSales(tenantId);
  const { data: allContracts = [] } = useInstallmentContracts(tenantId);
  const [chartMonth, setChartMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const sales = allSales
    .filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= from && t <= to && s.status === "completed";
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = sales.reduce((sum, s) => sum + (s.total ?? 0), 0);
  const contractsInRange = allContracts.filter((c) => {
    const t = new Date(c.created_at).getTime();
    return t >= from && t <= to;
  });

  const [chartYear, chartMonthIndex] = chartMonth.split("-").map(Number) as [number, number];
  const daysInMonth = new Date(chartYear, chartMonthIndex, 0).getDate();
  const monthlySales = allSales.filter((s) => {
    const d = new Date(s.created_at);
    return (
      d.getFullYear() === chartYear &&
      d.getMonth() + 1 === chartMonthIndex &&
      s.status === "completed"
    );
  });
  const dailyChartData = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const total = monthlySales
      .filter((s) => new Date(s.created_at).getDate() === day)
      .reduce((sum, s) => sum + (s.total ?? 0), 0);
    return { label: String(day), value: total };
  });
  const bestDay = dailyChartData.reduce(
    (best, d) => (d.value > best.value ? d : best),
    dailyChartData[0] ?? { label: "-", value: 0 },
  );

  return (
    <section className="mt-6">
      <Panel
        title="حركة المبيعات اليومية خلال شهر"
        description="اختر شهر لمعرفة أكتر الأيام مبيعًا فيه"
        actions={
          <input
            type="month"
            value={chartMonth}
            onChange={(e) => setChartMonth(e.target.value)}
            className="form-input"
            dir="ltr"
          />
        }
      >
        <SalesTrendChart data={dailyChartData} />
        {bestDay.value > 0 && (
          <p className="mt-3 text-sm text-muted-foreground">
            أكتر يوم مبيعًا في الشهر ده:{" "}
            <span className="font-bold text-foreground">يوم {bestDay.label}</span> بإجمالي{" "}
            <span className="font-bold text-foreground" dir="ltr">
              {bestDay.value.toLocaleString("ar-EG")} ج.م
            </span>
          </p>
        )}
      </Panel>

      <p className="mt-6 text-sm text-muted-foreground">
        فواتير البيع النقدي: <span className="font-bold text-foreground">{sales.length}</span> —
        عقود التقسيط في نفس الفترة:{" "}
        <span className="font-bold text-foreground">{contractsInRange.length}</span> (تفاصيلها في
        تاب "عقود التقسيط")
      </p>
      <p className="mt-1 text-sm text-muted-foreground">
        إجمالي المبيعات النقدية:{" "}
        <span className="font-bold text-foreground" dir="ltr">
          {total.toLocaleString("ar-EG")} ج.م
        </span>
      </p>
      <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">رقم الفاتورة</th>
              <th className="px-4 py-3 font-medium">العميل</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
              <th className="px-4 py-3 font-medium">التاريخ</th>
            </tr>
          </thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                  {s.invoice_number}
                </td>
                <td className="px-4 py-3 text-muted-foreground">{s.customer_name}</td>
                <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                  {(s.total ?? 0).toLocaleString("ar-EG")}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                  {new Date(s.created_at).toLocaleDateString("ar-EG")}
                </td>
              </tr>
            ))}
            {sales.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  لا يوجد مبيعات في هذه الفترة.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ContractsReport({ tenantId }: { tenantId: string }) {
  const { data: contractsData = [] } = useInstallmentContracts(tenantId);
  const { data: allInstallments = [] } = useInstallments(tenantId);
  const contracts = [...contractsData].sort((a, b) => b.created_at.localeCompare(a.created_at));

  return (
    <section className="mt-6">
      <div className="max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">رقم العقد</th>
              <th className="px-4 py-3 font-medium">العميل</th>
              <th className="px-4 py-3 font-medium">الإجمالي</th>
              <th className="px-4 py-3 font-medium">المتبقي</th>
              <th className="px-4 py-3 font-medium">الحالة</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((c) => {
              const remaining = allInstallments
                .filter((i) => i.contract_id === c.id && i.status !== "waived")
                .reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0);
              return (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      to="/contracts/$id"
                      params={{ id: c.id }}
                      className="text-primary hover:underline"
                      dir="ltr"
                    >
                      {c.contract_number}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {(c.total_amount ?? 0).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {remaining.toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {CONTRACT_STATUS_LABEL[c.status]}
                  </td>
                </tr>
              );
            })}
            {contracts.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                  لا يوجد عقود تقسيط بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function StatementReport({
  customerId,
  onCustomerChange,
  tenantId,
}: {
  customerId: string;
  onCustomerChange: (id: string) => void;
  tenantId: string;
}) {
  const { data: customers = [] } = useCustomers(tenantId);
  const { data: allSales = [] } = useSales(tenantId);
  const { data: allContracts = [] } = useInstallmentContracts(tenantId);
  const { data: allInstallments = [] } = useInstallments(tenantId);
  const { data: allPayments = [] } = useInstallmentPayments(tenantId);
  const { data: allReturns = [] } = useSaleReturns(tenantId);
  const customer = customers.find((c) => c.id === customerId);

  const sales = customer ? allSales.filter((s) => s.customer_id === customer.id) : [];
  const contracts = customer ? allContracts.filter((c) => c.customer_id === customer.id) : [];
  const contractIds = new Set(contracts.map((c) => c.id));
  const payments = allPayments.filter((p) => contractIds.has(p.contract_id));
  const returns = customer ? allReturns.filter((r) => r.customer_id === customer.id) : [];

  const totalPurchased =
    sales.reduce((sum, s) => sum + (s.total ?? 0), 0) +
    contracts.reduce((sum, c) => sum + (c.total_amount ?? 0), 0);
  const exposure = customer
    ? computeCustomerExposure(customer.id, allContracts, allInstallments)
    : 0;
  const lastPaymentDate = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    ?.created_at;

  type Row = { date: string; label: string; amount: number };
  const rows: Row[] = [
    ...sales.map((s) => ({
      date: s.created_at,
      label: `فاتورة ${s.invoice_number}`,
      amount: s.total ?? 0,
    })),
    ...contracts.map((c) => ({
      date: c.created_at,
      label: `عقد تقسيط ${c.contract_number}`,
      amount: c.total_amount ?? 0,
    })),
    ...payments.map((p) => ({
      date: p.created_at,
      label: `تحصيل ${p.receipt_number}`,
      amount: -p.amount,
    })),
    ...returns.map((r) => ({
      date: r.created_at,
      label: `مرتجع ${r.return_number}`,
      amount: -r.refund_amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  const balance = rows.reduce((sum, r) => sum + r.amount, 0);

  return (
    <section className="mt-6">
      <label className="block max-w-sm space-y-1">
        <span className="text-xs font-medium text-foreground">اختر عميل</span>
        <SearchPicker
          items={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
          value={customerId}
          onChange={onCustomerChange}
          placeholder="بحث باسم العميل..."
        />
      </label>

      {customer && (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard
              label="تاريخ الانضمام"
              value={new Date(customer.created_at).toLocaleDateString("ar-EG")}
              valueDir="ltr"
            />
            <StatCard
              label="إجمالي الشراء"
              value={`${totalPurchased.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
              tone="primary"
            />
            <StatCard
              label="المديونية الحالية"
              value={`${exposure.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
              tone={exposure > 0 ? "warning" : "default"}
            />
            <StatCard
              label="آخر تحصيل"
              value={lastPaymentDate ? new Date(lastPaymentDate).toLocaleDateString("ar-EG") : "—"}
              valueDir="ltr"
            />
          </div>
          <p className="mt-4 text-sm text-muted-foreground">
            صافي الحركة (فواتير/عقود مطروحًا منها تحصيلات ومرتجعات):{" "}
            <span className="font-bold text-foreground" dir="ltr">
              {balance.toLocaleString("ar-EG")} ج.م
            </span>
          </p>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">الحركة</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-foreground">{r.label}</td>
                    <td
                      className={`px-4 py-3 font-medium ${r.amount >= 0 ? "text-foreground" : "text-success"}`}
                      dir="ltr"
                    >
                      {r.amount >= 0 ? "" : "-"}
                      {Math.abs(r.amount).toLocaleString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(r.date).toLocaleDateString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد حركة لهذا العميل بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

function MovementReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const { data: allProducts = [] } = useProducts(tenantId);
  const { data: allSales = [] } = useSales(tenantId);
  const { data: allContracts = [] } = useInstallmentContracts(tenantId);
  const [order, setOrder] = useState<"fast" | "slow">("fast");
  const products = allProducts.filter((p) => p.active);
  const sales = allSales.filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= from && t <= to;
  });
  const contracts = allContracts.filter((c) => {
    const t = new Date(c.created_at).getTime();
    return t >= from && t <= to;
  });

  const soldQtyByProduct = new Map<string, number>();
  for (const s of sales) {
    for (const item of s.items ?? []) {
      soldQtyByProduct.set(
        item.product_id,
        (soldQtyByProduct.get(item.product_id) ?? 0) + item.quantity,
      );
    }
  }
  for (const c of contracts) {
    for (const item of c.items ?? []) {
      soldQtyByProduct.set(
        item.product_id,
        (soldQtyByProduct.get(item.product_id) ?? 0) + item.quantity,
      );
    }
  }

  const rows = products
    .map((p) => ({ product: p, quantitySold: soldQtyByProduct.get(p.id) ?? 0 }))
    .sort((a, b) =>
      order === "slow" ? a.quantitySold - b.quantitySold : b.quantitySold - a.quantitySold,
    );

  return (
    <section className="mt-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          الكمية المباعة (نقدًا أو تقسيطًا) خلال الفترة المحددة أعلاه.
        </p>
        <div className="flex gap-2">
          <button
            onClick={() => setOrder("fast")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              order === "fast"
                ? "bg-primary text-primary-foreground"
                : "border border-input text-foreground hover:bg-accent"
            }`}
          >
            الأكثر حركة
          </button>
          <button
            onClick={() => setOrder("slow")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
              order === "slow"
                ? "bg-primary text-primary-foreground"
                : "border border-input text-foreground hover:bg-accent"
            }`}
          >
            الأبطأ حركة
          </button>
        </div>
      </div>
      <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">الجهاز</th>
              <th className="px-4 py-3 font-medium">الكمية المباعة</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ product, quantitySold }) => (
              <tr key={product.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                <td
                  className={`px-4 py-3 font-medium ${quantitySold === 0 ? "text-destructive" : "text-muted-foreground"}`}
                  dir="ltr"
                >
                  {quantitySold}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

/** يبني تقريره مباشرة من القيود المحاسبية التلقائية الحقيقية (نفس مصدر الحقيقة اللي صفحة
 * "/accounting" بتعرضه) — بدون أي منطق مالي موازٍ جديد. الإيرادات = دائن حسابات 3000/3100،
 * المصروفات = مدين حساب 5000، صافي = الفرق بينهم. مبسّط عمدًا (تقريب تشغيلي وليس محاسبة
 * استحقاق كاملة)، لكن كل رقم فيه حقيقي ومتحدّث مع كل عملية. */
function FinancialReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const { data: allEntries = [] } = useJournalEntries(tenantId);
  const { data: allSales = [] } = useSales(tenantId);
  const { data: allContracts = [] } = useInstallmentContracts(tenantId);
  const { data: allPayments = [] } = useInstallmentPayments(tenantId);
  const { data: allAccounts = [] } = useTreasuryAccounts(tenantId);
  const { data: allMovements = [] } = useTreasuryMovements(tenantId);

  const entries = allEntries.filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t >= from && t <= to;
  });
  const inPeriod = (isoDate: string) => {
    const t = new Date(isoDate).getTime();
    return t >= from && t <= to;
  };

  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    for (const line of entry.lines ?? []) {
      const current = byAccount.get(line.account_code) ?? { debit: 0, credit: 0 };
      current.debit += line.debit ?? 0;
      current.credit += line.credit ?? 0;
      byAccount.set(line.account_code, current);
    }
  }

  const cashSalesTotal = allSales
    .filter((s) => s.status === "completed" && inPeriod(s.created_at))
    .reduce((sum, s) => sum + (s.total ?? 0), 0);
  const installmentSalesTotal = allContracts
    .filter((c) => inPeriod(c.created_at))
    .reduce((sum, c) => sum + (c.total_amount ?? 0), 0);
  const totalSales = cashSalesTotal + installmentSalesTotal;
  const collectionsTotal = allPayments
    .filter((p) => inPeriod(p.created_at))
    .reduce((sum, p) => sum + (p.amount ?? 0), 0);

  const salesRevenue = byAccount.get("3000")?.credit ?? 0;
  const financeRevenue = byAccount.get("3100")?.credit ?? 0;
  const totalRevenue = salesRevenue + financeRevenue;
  const totalExpenses = byAccount.get("5000")?.debit ?? 0;
  const net = totalRevenue - totalExpenses;
  const totalTreasuryBalance = allAccounts
    .filter((a) => a.active)
    .reduce((sum, a) => sum + computeAccountBalance(a.id, allMovements), 0);

  const chartData = [
    { label: "مبيعات كاش", value: cashSalesTotal },
    { label: "مبيعات تقسيط", value: installmentSalesTotal },
    { label: "تحصيلات", value: collectionsTotal },
    { label: "مصروفات", value: totalExpenses },
  ];

  return (
    <section className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="إجمالي المبيعات"
          value={`${totalSales.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="navy"
        />
        <StatCard
          label="مبيعات كاش"
          value={`${cashSalesTotal.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="teal"
        />
        <StatCard
          label="مبيعات تقسيط"
          value={`${installmentSalesTotal.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="navy"
        />
        <StatCard
          label="تحصيلات الأقساط"
          value={`${collectionsTotal.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="teal"
        />
        <StatCard
          label="إيرادات التمويل (تقسيط)"
          value={`${financeRevenue.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="navy"
        />
        <StatCard
          label="إجمالي المصروفات"
          value={`${totalExpenses.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="danger"
        />
        <StatCard
          label="رصيد الخزينة الإجمالي الآن"
          value={`${totalTreasuryBalance.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="teal"
        />
        <StatCard
          label="صافي الفترة"
          value={`${net.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone={net >= 0 ? "success" : "danger"}
        />
      </div>

      <Panel title="ملخص الحركة المالية" description="خلال الفترة المحددة أعلاه">
        <SalesTrendChart data={chartData} />
      </Panel>

      <Panel title="تفصيل الحسابات" description="مجموع الحركة على كل حساب خلال الفترة">
        <div className="max-h-[20rem] overflow-y-auto overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الحساب</th>
                <th className="px-4 py-3 font-medium">مدين</th>
                <th className="px-4 py-3 font-medium">دائن</th>
              </tr>
            </thead>
            <tbody>
              {Object.entries(ACCOUNT_LABELS).map(([code, name]) => {
                const totals = byAccount.get(code);
                if (!totals || (totals.debit === 0 && totals.credit === 0)) return null;
                return (
                  <tr key={code} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {code} — {name}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {totals.debit > 0 ? totals.debit.toLocaleString("ar-EG") : "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {totals.credit > 0 ? totals.credit.toLocaleString("ar-EG") : "—"}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد حركة مالية في هذه الفترة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Panel>
    </section>
  );
}

/** مقارنة سعر شراء منتج عبر الزمن — بتقرأ من `purchases.items` jsonb الموجود بالفعل (بدون أي
 * تغيير Schema)، مفيدة خصوصًا لعميل بيشتري "عند الطلب" ومحتاج يعرف هل سعر الجهاز ده غلي أو رخص
 * عن آخر مرة اشتراه. */
function PriceHistoryReport({
  from,
  to,
  tenantId,
}: {
  from: number;
  to: number;
  tenantId: string;
}) {
  const { data: products = [] } = useProducts(tenantId);
  const { data: purchases = [] } = usePurchases(tenantId);
  const [productId, setProductId] = useState("");

  const entries = purchases
    .filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= from && t <= to;
    })
    .flatMap((p) =>
      (p.items ?? [])
        .filter((item) => item.product_id === productId)
        .map((item) => ({
          date: p.created_at,
          supplierName: p.supplier_name,
          unitCost: item.unit_cost,
        })),
    )
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <section className="mt-6">
      <label className="block max-w-sm space-y-1">
        <span className="text-xs font-medium text-foreground">اختر جهاز</span>
        <SearchPicker
          items={products.map((p) => ({ id: p.id, label: p.name }))}
          value={productId}
          onChange={setProductId}
          placeholder="بحث باسم الجهاز..."
        />
      </label>

      {!productId && (
        <p className="mt-3 text-sm text-muted-foreground">اختر جهاز لعرض تاريخ أسعار شرائه.</p>
      )}

      {productId && (
        <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">التاريخ</th>
                <th className="px-4 py-3 font-medium">المورد</th>
                <th className="px-4 py-3 font-medium">سعر الوحدة</th>
                <th className="px-4 py-3 font-medium">التغيّر عن آخر مرة</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry, i) => {
                const prev = entries[i - 1];
                const delta = prev ? entry.unitCost - prev.unitCost : 0;
                const pct = prev && prev.unitCost > 0 ? (delta / prev.unitCost) * 100 : 0;
                return (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(entry.date).toLocaleDateString("ar-EG")}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{entry.supplierName}</td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {entry.unitCost.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${
                        delta > 0
                          ? "text-destructive"
                          : delta < 0
                            ? "text-success"
                            : "text-muted-foreground"
                      }`}
                      dir="ltr"
                    >
                      {prev
                        ? `${delta > 0 ? "+" : ""}${delta.toLocaleString("ar-EG")} ج.م (${pct > 0 ? "+" : ""}${pct.toFixed(1)}%)`
                        : "أول شراء مسجّل"}
                    </td>
                  </tr>
                );
              })}
              {entries.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد عمليات شراء لهذا الجهاز في الفترة المحددة.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
