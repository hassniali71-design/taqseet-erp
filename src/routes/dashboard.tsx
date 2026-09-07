import { createFileRoute, Link } from "@tanstack/react-router";

import { AppHeader } from "@/components/AppHeader";
import { getCustomers, getProducts, getTenants } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const session = useRequireSession();
  if (!session) return null;

  const tenant = getTenants().find((t) => t.id === session.tenant_id);
  const customers = getCustomers();
  const products = getProducts();

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">لوحة التحكم</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          محل: {tenant?.name} — حالة الاشتراك: {tenant?.status}
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
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
        </div>

        <p className="mt-8 max-w-xl text-xs text-muted-foreground">
          هذه بيانات Mock مخزّنة محليًا (localStorage) لأغراض التجربة فقط — لا يوجد بعد بيع نقدي أو
          تقسيط أو مخزون حقيقي (Phase 3/4 القادمة). راجع CLAUDE.md لتفاصيل الحالة الفعلية للمشروع.
        </p>
      </main>
    </div>
  );
}
