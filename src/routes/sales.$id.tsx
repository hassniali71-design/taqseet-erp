import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import { getSales, getTenants, subscribeData } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/sales/$id")({
  component: SaleReceiptPage,
});

function SaleReceiptPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const sale = getSales().find((s) => s.id === id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  if (!sale) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader session={session} />
        <main className="mx-auto max-w-2xl px-4 py-8 text-center text-muted-foreground">
          الفاتورة غير موجودة.{" "}
          <Link to="/sales/new" className="text-primary hover:underline">
            بيع جديد
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">فاتورة بيع</h1>
          <Link
            to="/sales/new"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            + بيع جديد
          </Link>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
          <div className="flex items-start justify-between border-b border-border pb-4">
            <div>
              <p className="text-lg font-bold text-foreground">{tenant?.name}</p>
              <p className="mt-1 text-xs text-muted-foreground" dir="ltr">
                {new Date(sale.created_at).toLocaleString("ar-EG")}
              </p>
            </div>
            <div className="text-left">
              <p className="text-sm font-bold text-foreground" dir="ltr">
                {sale.invoice_number}
              </p>
              <p className="text-xs text-muted-foreground">{sale.customer_name}</p>
            </div>
          </div>

          <table className="mt-4 w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="py-2 font-medium">الصنف</th>
                <th className="py-2 font-medium">السيريال</th>
                <th className="py-2 font-medium">الكمية</th>
                <th className="py-2 font-medium">السعر</th>
                <th className="py-2 font-medium">الإجمالي</th>
              </tr>
            </thead>
            <tbody>
              {sale.items.map((item, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="py-2 font-medium text-foreground">{item.product_name}</td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.serial_number ?? "—"}
                  </td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.quantity}
                  </td>
                  <td className="py-2 text-muted-foreground" dir="ltr">
                    {item.unit_price.toLocaleString("ar-EG")}
                  </td>
                  <td className="py-2 font-medium text-foreground" dir="ltr">
                    {item.line_total.toLocaleString("ar-EG")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="mt-4 space-y-1 border-t border-border pt-4 text-left">
            <p className="text-sm text-muted-foreground" dir="ltr">
              الإجمالي: {sale.subtotal.toLocaleString("ar-EG")} ج.م
            </p>
            {sale.discount_amount > 0 && (
              <p className="text-sm text-muted-foreground" dir="ltr">
                الخصم ({sale.discount_pct}%): -{sale.discount_amount.toLocaleString("ar-EG")} ج.م
              </p>
            )}
            <p className="text-xl font-bold text-foreground" dir="ltr">
              الصافي: {sale.total.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
