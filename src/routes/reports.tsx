import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SalesTrendChart } from "@/components/ui/Charts";
import { Panel, StatCard } from "@/components/ui/StatCard";
import {
  computeCustomerExposure,
  useCustomers,
  useInstallmentContracts,
  useInstallmentPayments,
  useInstallments,
  useJournalEntries,
  useProducts,
  useSaleReturns,
  useSales,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import type { AccountCode } from "@/types";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Tab = "sales" | "contracts" | "statement" | "movement" | "financial";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sales", label: "المبيعات" },
  { id: "contracts", label: "عقود التقسيط" },
  { id: "statement", label: "كشف حساب عميل" },
  { id: "movement", label: "حركة الأصناف" },
  { id: "financial", label: "التقرير المالي" },
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

        {(tab === "sales" || tab === "movement" || tab === "financial") && (
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
      </main>
    </div>
  );
}

function SalesReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const { data: allSales = [] } = useSales(tenantId);
  const [chartMonth, setChartMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const sales = allSales
    .filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= from && t <= to && s.status === "completed";
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = sales.reduce((sum, s) => sum + s.total, 0);

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
      .reduce((sum, s) => sum + s.total, 0);
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
        عدد الفواتير: {sales.length} — الإجمالي:{" "}
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
                  {s.total.toLocaleString("ar-EG")}
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
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {c.contract_number}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {c.total_amount.toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {remaining.toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{c.status}</td>
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
    sales.reduce((sum, s) => sum + s.total, 0) +
    contracts.reduce((sum, c) => sum + c.total_amount, 0);
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
      amount: s.total,
    })),
    ...contracts.map((c) => ({
      date: c.created_at,
      label: `عقد تقسيط ${c.contract_number}`,
      amount: c.total_amount,
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
        <select
          value={customerId}
          onChange={(e) => onCustomerChange(e.target.value)}
          className="form-input"
        >
          <option value="">اختر عميل</option>
          {customers.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name} ({c.code})
            </option>
          ))}
        </select>
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
    for (const item of s.items) {
      soldQtyByProduct.set(
        item.product_id,
        (soldQtyByProduct.get(item.product_id) ?? 0) + item.quantity,
      );
    }
  }
  for (const c of contracts) {
    for (const item of c.items) {
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
  const entries = allEntries.filter((e) => {
    const t = new Date(e.created_at).getTime();
    return t >= from && t <= to;
  });

  const byAccount = new Map<string, { debit: number; credit: number }>();
  for (const entry of entries) {
    for (const line of entry.lines) {
      const current = byAccount.get(line.account_code) ?? { debit: 0, credit: 0 };
      current.debit += line.debit;
      current.credit += line.credit;
      byAccount.set(line.account_code, current);
    }
  }

  const salesRevenue = byAccount.get("3000")?.credit ?? 0;
  const financeRevenue = byAccount.get("3100")?.credit ?? 0;
  const totalRevenue = salesRevenue + financeRevenue;
  const totalExpenses = byAccount.get("5000")?.debit ?? 0;
  const net = totalRevenue - totalExpenses;

  const chartData = [
    { label: "الإيرادات", value: totalRevenue },
    { label: "المصروفات", value: totalExpenses },
  ];

  return (
    <section className="mt-6 space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="إيرادات المبيعات"
          value={`${salesRevenue.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="primary"
        />
        <StatCard
          label="إيرادات التمويل (تقسيط)"
          value={`${financeRevenue.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="primary"
        />
        <StatCard
          label="إجمالي المصروفات"
          value={`${totalExpenses.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="danger"
        />
        <StatCard
          label="صافي الفترة"
          value={`${net.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone={net >= 0 ? "success" : "danger"}
        />
      </div>

      <Panel title="الإيرادات مقابل المصروفات" description="خلال الفترة المحددة أعلاه">
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
