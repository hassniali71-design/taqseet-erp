import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import {
  getAccountBalance,
  getCurrentTenantSettings,
  getCustomers,
  getDeliveryOrders,
  getEffectiveInstallmentStatus,
  getExpenses,
  getInstallmentContracts,
  getInstallments,
  getProductStock,
  getProducts,
  getSales,
  getTenants,
  getTreasuryAccounts,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

function DashboardPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const tenant = getTenants().find((t) => t.id === session.tenant_id);
  const customers = getCustomers();
  const products = getProducts();
  const sales = getSales();
  const settings = getCurrentTenantSettings();

  const todaySalesTotal = sales
    .filter((s) => isToday(s.created_at) && s.status === "completed")
    .reduce((sum, s) => sum + s.total, 0);

  const contracts = getInstallmentContracts().filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
  const allInstallments = getInstallments();
  let dueTodayAmount = 0;
  let overdueAmount = 0;
  let overdueCount = 0;
  for (const contract of contracts) {
    const lines = allInstallments.filter(
      (i) => i.contract_id === contract.id && i.status !== "waived" && i.status !== "rescheduled",
    );
    for (const line of lines) {
      const outstanding = Math.max(0, line.amount - line.paid_amount);
      if (outstanding <= 0) continue;
      const effective = getEffectiveInstallmentStatus(line, settings.grace_period_days);
      if (effective === "due") dueTodayAmount += outstanding;
      if (effective === "overdue") {
        overdueAmount += outstanding;
        overdueCount += 1;
      }
    }
  }

  const lowStockProducts = products.filter(
    (p) => p.active && !p.serial_required && getProductStock(p.id, p) < p.min_stock,
  );

  const pendingDeliveries = getDeliveryOrders().filter((d) => d.status !== "delivered").length;
  const pendingExpenses = getExpenses().filter((e) => e.needs_approval).length;
  const cashierAccount = getTreasuryAccounts().find((a) => a.kind === "cashier");
  const cashierBalance = cashierAccount ? getAccountBalance(cashierAccount.id) : 0;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          محل: {tenant?.name} — حالة الاشتراك: {tenant?.status}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="مبيعات اليوم" value={`${todaySalesTotal.toLocaleString("ar-EG")} ج.م`} />
          <Stat
            label="مستحق اليوم (تقسيط)"
            value={`${dueTodayAmount.toLocaleString("ar-EG")} ج.م`}
          />
          <Stat
            label="متأخرات (تقسيط)"
            value={`${overdueAmount.toLocaleString("ar-EG")} ج.م`}
            danger={overdueCount > 0}
            {...(overdueCount > 0 && { sub: `${overdueCount} قسط متأخر` })}
          />
          <Stat
            label="رصيد خزينة الكاشير"
            value={`${cashierBalance.toLocaleString("ar-EG")} ج.م`}
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Stat label="عملاء" value={String(customers.length)} />
          <Stat label="عقود تقسيط مفتوحة" value={String(contracts.length)} />
          <Stat
            label="أجهزة تحت الحد الأدنى"
            value={String(lowStockProducts.length)}
            danger={lowStockProducts.length > 0}
          />
          <Stat label="توصيلات جارية" value={String(pendingDeliveries)} />
        </div>

        {(overdueCount > 0 || lowStockProducts.length > 0 || pendingExpenses > 0) && (
          <div className="mt-6 rounded-xl border border-warning/30 bg-warning/5 p-5">
            <h2 className="text-sm font-bold text-foreground">قرارات تحتاج انتباه</h2>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {overdueCount > 0 && (
                <li>
                  <Link to="/collections" className="text-primary hover:underline">
                    {overdueCount} قسط متأخر بإجمالي {overdueAmount.toLocaleString("ar-EG")} ج.م ←
                  </Link>
                </li>
              )}
              {lowStockProducts.length > 0 && (
                <li>
                  <Link to="/products" className="text-primary hover:underline">
                    {lowStockProducts.length} صنف تحت الحد الأدنى للمخزون ←
                  </Link>
                </li>
              )}
              {pendingExpenses > 0 && (
                <li>
                  <Link to="/expenses" className="text-primary hover:underline">
                    {pendingExpenses} مصروف يحتاج اعتماد ←
                  </Link>
                </li>
              )}
            </ul>
          </div>
        )}

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Link
            to="/customers"
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent"
          >
            <p className="text-sm text-muted-foreground">العملاء</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{customers.length}</p>
            <p className="mt-2 text-xs text-primary">إدارة العملاء ←</p>
          </Link>

          <Link
            to="/products"
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent"
          >
            <p className="text-sm text-muted-foreground">الأجهزة (المنتجات)</p>
            <p className="mt-1 text-3xl font-bold text-foreground">{products.length}</p>
            <p className="mt-2 text-xs text-primary">إدارة الأجهزة ←</p>
          </Link>

          <Link
            to="/reports"
            className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:bg-accent"
          >
            <p className="text-sm text-muted-foreground">التقارير</p>
            <p className="mt-1 text-3xl font-bold text-foreground">📊</p>
            <p className="mt-2 text-xs text-primary">عرض التقارير ←</p>
          </Link>
        </div>
      </main>
    </div>
  );
}

function Stat({
  label,
  value,
  danger,
  sub,
}: {
  label: string;
  value: string;
  danger?: boolean;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-xl font-bold ${danger ? "text-destructive" : "text-foreground"}`}
        dir="ltr"
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs text-muted-foreground">{sub}</p>}
    </div>
  );
}
