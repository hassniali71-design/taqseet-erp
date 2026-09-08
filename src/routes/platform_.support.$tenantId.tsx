import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowRight,
  Building2,
  Package,
  ReceiptText,
  Users,
  Wallet,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Logo } from "@/components/Logo";
import { Panel, StatCard } from "@/components/ui/StatCard";
import { useSession } from "@/hooks/use-session";
import {
  getAccountBalance,
  getAuditLogs,
  getCustomers,
  getInstallmentContracts,
  getInstallments,
  getManagedTenants,
  getProducts,
  getSales,
  getTreasuryAccounts,
  getUsers,
  subscribeData,
} from "@/lib/data-store";

export const Route = createFileRoute("/platform_/support/$tenantId")({
  component: SupportAccessPage,
});

/**
 * Phase 9 Support Access — deliberately NOT real impersonation (logging in as the tenant's
 * user). Per the spec's own guidance for a Mock stage: a read-only summary view instead,
 * gated by a mandatory reason collected in platform.tsx before navigating here, and every
 * visit is itself an audit row (`support_access.use`, recorded by the caller) that shows up
 * in the log below — so the log always includes the visit that got you to this page.
 */
function SupportAccessPage() {
  const session = useSession();
  const navigate = useNavigate();
  const { tenantId } = Route.useParams();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const currentUser = session ? getUsers().find((u) => u.id === session.user_id) : undefined;

  useEffect(() => {
    if (session === null) {
      void navigate({ to: "/platform/login" });
      return;
    }
    if (session && currentUser && !currentUser.is_platform_owner) {
      void navigate({ to: "/login" });
    }
  }, [session, currentUser, navigate]);

  if (!session || !currentUser?.is_platform_owner) return null;

  const tenant = getManagedTenants().find((t) => t.id === tenantId);
  if (!tenant) {
    return (
      <div className="min-h-screen bg-sidebar p-8 text-center font-bold text-sidebar-foreground">
        العميل غير موجود.{" "}
        <Link to="/platform" className="text-primary hover:underline">
          العودة لغرفة التحكم
        </Link>
      </div>
    );
  }

  const owner = getUsers().find((u) => u.tenant_id === tenantId && !u.is_platform_owner);
  const customers = getCustomers(tenantId);
  const products = getProducts(tenantId);
  const sales = getSales(tenantId);
  const contracts = getInstallmentContracts(tenantId);
  const activeContracts = contracts.filter(
    (c) => c.status === "active" || c.status === "partially_paid",
  );
  const overdueInstallments = getInstallments(tenantId).filter((i) => i.status === "overdue");
  const treasuryBalance = getTreasuryAccounts(tenantId).reduce(
    (sum, acc) => sum + getAccountBalance(acc.id),
    0,
  );
  const accessLog = getAuditLogs(tenantId)
    .filter((a) => a.action === "support_access.use")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 10);

  return (
    <div className="min-h-screen bg-sidebar">
      <header className="border-b border-sidebar-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo className="text-sidebar-foreground" />
          <Link
            to="/platform"
            className="flex items-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
          >
            <ArrowRight className="h-3.5 w-3.5" />
            العودة لغرفة التحكم
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex items-center gap-2 rounded-2xl border-2 border-warning/40 bg-warning/10 p-4 text-sm font-bold text-sidebar-foreground/80">
          <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
          عرض للقراءة فقط — دخولك هذا مسجَّل الآن في سجل تدقيق "{tenant.name}" باسمك وسببك، ولا
          يمكنك تعديل أي بيانات من هنا.
        </div>

        <div className="mt-6">
          <h1 className="text-2xl text-sidebar-foreground">{tenant.name}</h1>
          <p className="mt-1 text-sm font-bold text-sidebar-foreground/70">
            المالك: {tenant.owner_name}
            {owner ? ` — ${owner.email}` : ""}
          </p>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <StatCard label="العملاء" value={String(customers.length)} icon={Users} tone="primary" />
          <StatCard
            label="المنتجات"
            value={String(products.length)}
            icon={Package}
            tone="primary"
          />
          <StatCard
            label="عمليات البيع"
            value={String(sales.length)}
            icon={ReceiptText}
            tone="primary"
          />
          <StatCard
            label="عقود تقسيط نشطة"
            value={String(activeContracts.length)}
            icon={Building2}
            tone="primary"
          />
          <StatCard
            label="أقساط متأخرة"
            value={String(overdueInstallments.length)}
            icon={AlertTriangle}
            tone={overdueInstallments.length > 0 ? "danger" : "success"}
          />
          <StatCard
            label="رصيد الخزينة"
            value={treasuryBalance.toLocaleString("ar-EG")}
            icon={Wallet}
            tone="primary"
            valueDir="ltr"
          />
        </div>

        <div className="mt-6">
          <Panel
            title="سجل دخول الدعم الفني لهذا العميل"
            description="آخر ١٠ مرات دخل فيها فريق المنصة لعرض بيانات هذا العميل — لا انتحال هوية، دخول موثّق فقط"
            className="border-sidebar-border bg-sidebar-accent/20 [&_h2]:text-sidebar-foreground [&_p]:text-sidebar-foreground/70"
          >
            <div className="max-h-80 overflow-y-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sidebar-border text-right text-sidebar-foreground/60">
                    <th className="pb-2 font-extrabold">التاريخ</th>
                    <th className="pb-2 font-extrabold">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {accessLog.map((entry) => (
                    <tr key={entry.id} className="border-b border-sidebar-border/60">
                      <td className="py-2 font-bold text-sidebar-foreground/80" dir="ltr">
                        {new Date(entry.created_at).toLocaleString("ar-EG")}
                      </td>
                      <td className="py-2 font-bold text-sidebar-foreground">
                        {entry.reason ?? "-"}
                      </td>
                    </tr>
                  ))}
                  {accessLog.length === 0 && (
                    <tr>
                      <td
                        colSpan={2}
                        className="py-4 text-center font-bold text-sidebar-foreground/60"
                      >
                        لا يوجد دخول دعم سابق مسجَّل.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>
      </main>
    </div>
  );
}
