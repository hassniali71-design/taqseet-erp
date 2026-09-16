import { createFileRoute, Link } from "@tanstack/react-router";
import {
  AlertTriangle,
  Clock,
  Landmark,
  PackageX,
  Percent,
  ReceiptText,
  Truck,
  Users,
  Wallet,
} from "lucide-react";
import { AppSidebar } from "@/components/AppSidebar";
import { SalesTrendChart } from "@/components/ui/Charts";
import { LinkCard, Panel } from "@/components/ui/StatCard";
import { getEffectiveInstallmentStatus } from "@/lib/data-store";
import {
  computeAccountBalance,
  computeProductStock,
  useCurrentTenant,
  useCurrentTenantSettings,
  useCustomers,
  useDeliveryOrders,
  useExpenses,
  useInstallmentContracts,
  useInstallments,
  useInventoryMovements,
  useProducts,
  useProductSerials,
  useSales,
  useTreasuryAccounts,
  useTreasuryMovements,
} from "@/lib/supabase-queries";
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

const MONTH_LABELS_AR = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function DashboardPage() {
  const session = useRequireSession();

  const { data: tenant } = useCurrentTenant(session?.tenant_id);
  const { data: customers = [] } = useCustomers(session?.tenant_id);
  const { data: products = [] } = useProducts(session?.tenant_id);
  const { data: allSales = [] } = useSales(session?.tenant_id);
  const { data: settingsData } = useCurrentTenantSettings(session?.tenant_id);
  const { data: contractsAll = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: allInstallments = [] } = useInstallments(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const { data: allDeliveryOrders = [] } = useDeliveryOrders(session?.tenant_id);
  const { data: allExpenses = [] } = useExpenses(session?.tenant_id);
  const { data: allAccounts = [] } = useTreasuryAccounts(session?.tenant_id);
  const { data: allTreasuryMovements = [] } = useTreasuryMovements(session?.tenant_id);

  if (!session) return null;

  const sales = allSales.filter((s) => s.status === "completed");
  const settings = settingsData ?? { grace_period_days: 3 };

  const today = new Date();
  const todaySalesTotal = sales
    .filter((s) => isSameDay(s.created_at, today))
    .reduce((sum, s) => sum + s.total, 0);

  const last5Months = Array.from({ length: 5 }, (_, i) => {
    const monthDate = new Date(today.getFullYear(), today.getMonth() - (4 - i), 1);
    const total = sales
      .filter((s) => {
        const d = new Date(s.created_at);
        return d.getFullYear() === monthDate.getFullYear() && d.getMonth() === monthDate.getMonth();
      })
      .reduce((sum, s) => sum + s.total, 0);
    return { label: MONTH_LABELS_AR[monthDate.getMonth()] ?? "", value: total };
  });

  const contracts = contractsAll.filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
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
    (p) =>
      p.active &&
      !p.serial_required &&
      computeProductStock(p.id, false, allSerials, allMovements) < p.min_stock,
  );

  const pendingDeliveries = allDeliveryOrders.filter((d) => d.status !== "delivered").length;
  const pendingExpenses = allExpenses.filter((e) => e.needs_approval).length;
  const cashierAccount = allAccounts.find((a) => a.kind === "cashier");
  const cashierBalance = cashierAccount
    ? computeAccountBalance(cashierAccount.id, allTreasuryMovements)
    : 0;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-sm font-bold text-muted-foreground">
          محل: {tenant?.name} — حالة الاشتراك: {tenant?.status}
        </p>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <Link to="/reports">
            <LinkCard
              label="مبيعات اليوم"
              value={`${todaySalesTotal.toLocaleString("ar-EG")} ج.م`}
              cta="عرض تقرير المبيعات ←"
              icon={Wallet}
              tone="navy"
              valueDir="ltr"
            />
          </Link>
          <Link to="/collections">
            <LinkCard
              label="مستحق اليوم (تقسيط)"
              value={`${dueTodayAmount.toLocaleString("ar-EG")} ج.م`}
              cta="فتح التحصيل ←"
              icon={Clock}
              tone="teal"
              valueDir="ltr"
            />
          </Link>
          <Link to="/collections">
            <LinkCard
              label="متأخرات (تقسيط)"
              value={`${overdueAmount.toLocaleString("ar-EG")} ج.م`}
              cta="فتح التحصيل ←"
              icon={AlertTriangle}
              tone={overdueCount > 0 ? "danger" : "navy"}
              valueDir="ltr"
              {...(overdueCount > 0 && { sub: `${overdueCount} قسط متأخر` })}
            />
          </Link>
          <Link to="/treasury">
            <LinkCard
              label="رصيد خزينة الكاشير"
              value={`${cashierBalance.toLocaleString("ar-EG")} ج.م`}
              cta="فتح الخزينة ←"
              icon={Landmark}
              tone="teal"
              valueDir="ltr"
            />
          </Link>
          <Link to="/reports">
            <LinkCard
              label="إجمالي عدد الفواتير"
              value={String(sales.length)}
              cta="عرض تقرير المبيعات ←"
              icon={ReceiptText}
              tone="navy"
            />
          </Link>
          <Link to="/customers">
            <LinkCard
              label="عملاء"
              value={String(customers.length)}
              cta="إدارة العملاء ←"
              icon={Users}
              tone="teal"
            />
          </Link>
          <Link to="/collections">
            <LinkCard
              label="عقود تقسيط مفتوحة"
              value={String(contracts.length)}
              cta="فتح التحصيل ←"
              icon={Percent}
              tone="navy"
            />
          </Link>
          <Link to="/products">
            <LinkCard
              label="أجهزة تحت الحد الأدنى"
              value={String(lowStockProducts.length)}
              cta="إدارة الأجهزة ←"
              icon={PackageX}
              tone={lowStockProducts.length > 0 ? "danger" : "teal"}
            />
          </Link>
          <Link to="/deliveries">
            <LinkCard
              label="توصيلات جارية"
              value={String(pendingDeliveries)}
              cta="فتح التوصيل ←"
              icon={Truck}
              tone="navy"
            />
          </Link>
        </div>

        <div className="mt-6">
          <Panel title="المبيعات آخر 5 شهور" description="إجمالي المبيعات النقدية المكتملة شهريًا">
            <SalesTrendChart data={last5Months} />
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
      </main>
    </div>
  );
}
