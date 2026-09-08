import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { getPurchases, getTenants, subscribeData } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/purchases/$id")({
  component: PurchaseReceiptPage,
});

function PurchaseReceiptPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const purchase = getPurchases(session.tenant_id).find((p) => p.id === id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  if (!purchase) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-2xl px-4 py-8 text-center text-muted-foreground">
          أمر الشراء غير موجود.{" "}
          <Link to="/purchases/new" className="text-primary hover:underline">
            أمر شراء جديد
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">أمر شراء</h1>
          <Link
            to="/purchases/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + أمر شراء جديد
          </Link>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-lg font-bold text-foreground">{tenant?.name}</p>
              <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                {new Date(purchase.created_at).toLocaleString("ar-EG")}
              </p>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-foreground" dir="ltr">
                {purchase.purchase_number}
              </p>
              <p className="text-xs text-muted-foreground">{purchase.supplier_name}</p>
            </div>
          </div>

          <table className="mt-4 w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">الصنف</th>
                <th className="py-2 font-medium">السيريالات</th>
                <th className="py-2 font-medium">الكمية</th>
                <th className="py-2 font-medium">سعر التكلفة</th>
                <th className="py-2 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {purchase.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">{item.product_name}</td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.serial_numbers.length > 0 ? item.serial_numbers.join(", ") : "—"}
                  </td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.quantity}
                  </td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.unit_cost.toLocaleString("ar-EG")}
                  </td>
                  <td className="py-2 font-medium text-foreground" dir="ltr">
                    {item.line_total.toLocaleString("ar-EG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 border-t border-border pt-4 text-left">
            <p className="text-xl font-bold text-foreground" dir="ltr">
              الإجمالي: {purchase.total.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
