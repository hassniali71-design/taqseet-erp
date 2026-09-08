import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  CreditCard,
  Landmark,
  Package,
  PackageX,
  Percent,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SalesTrendChart } from "@/components/ui/Charts";
import { LinkCard, Panel, StatCard } from "@/components/ui/StatCard";
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

function isSameDay(isoDate: string, ref: Date): boolean {
  const d = new Date(isoDate);
  return (
    d.getFullYear() === ref.getFullYear() &&
    d.getMonth() === ref.getMonth() &&
    d.getDate() === ref.getDate()
  );
}

const WEEKDAY_LABELS_AR = ["أحد", "اثنين", "ثلاثاء", "أربعاء", "خميس", "جمعة", "سبت"];

function DashboardPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const tenant = getTenants().find((t) => t.id === session.tenant_id);
  const customers = getCustomers(session.tenant_id);
  const products = getProducts(session.tenant_id);
  const sales = getSales(session.tenant_id).filter((s) => s.status === "completed");
  const settings = getCurrentTenantSettings();

  const today = new Date();
  const todaySalesTotal = sales
    .filter((s) => isSameDay(s.created_at, today))
    .reduce((sum, s) => sum + s.total, 0);

  const last7Days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(today);
    day.setDate(day.getDate() - (6 - i));
    const total = sales
      .filter((s) => isSameDay(s.created_at, day))
      .reduce((sum, s) => sum + s.total, 0);
    return { label: WEEKDAY_LABELS_AR[day.getDay()] ?? "", value: total };
  });

  const contracts = getInstallmentContracts(session.tenant_id).filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
  const allInstallments = getInstallments(session.tenant_id);
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

  const pendingDeliveries = getDeliveryOrders(session.tenant_id).filter(
    (d) => d.status !== "delivered",
  ).length;
  const pendingExpenses = getExpenses(session.tenant_id).filter((e) => e.needs_approval).length;
  const cashierAccount = getTreasuryAccounts(session.tenant_id).find((a) => a.kind === "cashier");
  const cashierBalance = cashierAccount ? getAccountBalance(cashierAccount.id) : 0;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          محل: {tenant?.name} — حالة الاشتراك: {tenant?.status}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="مبيعات اليوم"
            value={`${todaySalesTotal.toLocaleString("ar-EG")} ج.م`}
            icon={Wallet}
            tone="primary"
            valueDir="ltr"
          />
          <StatCard
            label="مستحق اليوم (تقسيط)"
            value={`${dueTodayAmount.toLocaleString("ar-EG")} ج.م`}
            icon={Clock}
            valueDir="ltr"
          />
          <StatCard
            label="متأخرات (تقسيط)"
            value={`${overdueAmount.toLocaleString("ar-EG")} ج.م`}
            icon={AlertTriangle}
            tone={overdueCount > 0 ? "danger" : "default"}
            valueDir="ltr"
            {...(overdueCount > 0 && { sub: `${overdueCount} قسط متأخر` })}
          />
          <StatCard
            label="رصيد خزينة الكاشير"
            value={`${cashierBalance.toLocaleString("ar-EG")} ج.م`}
            icon={Landmark}
            valueDir="ltr"
          />
        </div>

        <div className="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="عملاء" value={String(customers.length)} icon={Users} />
          <StatCard label="عقود تقسيط مفتوحة" value={String(contracts.length)} icon={Percent} />
          <StatCard
            label="أجهزة تحت الحد الأدنى"
            value={String(lowStockProducts.length)}
            icon={PackageX}
            tone={lowStockProducts.length > 0 ? "danger" : "default"}
          />
          <StatCard label="توصيلات جارية" value={String(pendingDeliveries)} icon={Truck} />
        </div>

        <div className="mt-6">
          <Panel title="المبيعات آخر 7 أيام" description="إجمالي المبيعات النقدية المكتملة يومياً">
            <SalesTrendChart data={last7Days} />
          </Panel>
        </div>

        {(overdueCount > 0 || lowStockProducts.length > 0 || pendingExpenses > 0) && (
          <div className="mt-6 rounded-2xl border-2 border-warning/40 bg-warning/5 p-5">
            <h2 className="text-sm text-foreground">قرارات تحتاج انتباه</h2>
            <ul className="mt-2 space-y-1 text-sm font-bold text-muted-foreground">
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
          <Link to="/customers">
            <LinkCard
              label="العملاء"
              value={String(customers.length)}
              cta="إدارة العملاء ←"
              icon={Users}
            />
          </Link>
          <Link to="/products">
            <LinkCard
              label="الأجهزة (المنتجات)"
              value={String(products.length)}
              cta="إدارة الأجهزة ←"
              icon={Package}
              tone="default"
            />
          </Link>
          <Link to="/reports">
            <LinkCard
              label="التقارير"
              value="📊"
              cta="عرض التقارير ←"
              icon={CreditCard}
              tone="default"
            />
          </Link>
        </div>
      </main>
    </div>
  );
}
