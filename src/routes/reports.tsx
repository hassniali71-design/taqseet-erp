import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getCustomers,
  getInstallmentContracts,
  getInstallmentPayments,
  getInstallments,
  getProducts,
  getSaleReturns,
  getSales,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/reports")({
  component: ReportsPage,
});

type Tab = "sales" | "contracts" | "statement" | "slow-moving";

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "sales", label: "المبيعات" },
  { id: "contracts", label: "عقود التقسيط" },
  { id: "statement", label: "كشف حساب عميل" },
  { id: "slow-moving", label: "أصناف بطيئة الحركة" },
];

function daysAgo(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d;
}

function ReportsPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [tab, setTab] = useState<Tab>("sales");
  const [fromDate, setFromDate] = useState(() => daysAgo(30).toISOString().slice(0, 10));
  const [toDate, setToDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [statementCustomerId, setStatementCustomerId] = useState("");

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

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

        {(tab === "sales" || tab === "slow-moving") && (
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
        {tab === "slow-moving" && (
          <SlowMovingReport from={from} to={to} tenantId={session.tenant_id} />
        )}
      </main>
    </div>
  );
}

function SalesReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const sales = getSales(tenantId)
    .filter((s) => {
      const t = new Date(s.created_at).getTime();
      return t >= from && t <= to && s.status === "completed";
    })
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const total = sales.reduce((sum, s) => sum + s.total, 0);

  return (
    <section className="mt-6">
      <p className="text-sm text-muted-foreground">
        عدد الفواتير: {sales.length} — الإجمالي:{" "}
        <span className="font-bold text-foreground" dir="ltr">
          {total.toLocaleString("ar-EG")} ج.م
        </span>
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
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
  const contracts = getInstallmentContracts(tenantId).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
  const allInstallments = getInstallments(tenantId);

  return (
    <section className="mt-6">
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
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
  const customers = getCustomers(tenantId);
  const customer = customers.find((c) => c.id === customerId);

  const sales = customer ? getSales(tenantId).filter((s) => s.customer_id === customer.id) : [];
  const contracts = customer
    ? getInstallmentContracts(tenantId).filter((c) => c.customer_id === customer.id)
    : [];
  const contractIds = new Set(contracts.map((c) => c.id));
  const payments = getInstallmentPayments(tenantId).filter((p) => contractIds.has(p.contract_id));
  const returns = customer
    ? getSaleReturns(tenantId).filter((r) => r.customer_id === customer.id)
    : [];

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
          <p className="mt-4 text-sm text-muted-foreground">
            صافي الحركة (فواتير/عقود مطروحًا منها تحصيلات ومرتجعات):{" "}
            <span className="font-bold text-foreground" dir="ltr">
              {balance.toLocaleString("ar-EG")} ج.م
            </span>
          </p>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
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

function SlowMovingReport({ from, to, tenantId }: { from: number; to: number; tenantId: string }) {
  const products = getProducts(tenantId).filter((p) => p.active);
  const sales = getSales(tenantId).filter((s) => {
    const t = new Date(s.created_at).getTime();
    return t >= from && t <= to;
  });
  const contracts = getInstallmentContracts(tenantId).filter((c) => {
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
    .sort((a, b) => a.quantitySold - b.quantitySold);

  return (
    <section className="mt-6">
      <p className="text-sm text-muted-foreground">
        الكمية المباعة (نقدًا أو تقسيطًا) خلال الفترة المحددة أعلاه، مرتبة من الأقل للأكثر.
      </p>
      <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="border-b border-border text-xs text-muted-foreground">
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
