import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  createReturn,
  getSaleReturns,
  getSales,
  getTenants,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/sales/$id")({
  component: SaleReceiptPage,
});

function SaleReceiptPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [showReturnForm, setShowReturnForm] = useState(false);
  const [returnQuantities, setReturnQuantities] = useState<Record<number, string>>({});
  const [returnReason, setReturnReason] = useState("");
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const sale = getSales(session.tenant_id).find((s) => s.id === id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  if (!sale) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-2xl px-4 py-8 text-center text-muted-foreground">
          الفاتورة غير موجودة.{" "}
          <Link to="/sales/new" className="text-primary hover:underline">
            بيع جديد
          </Link>
        </main>
      </div>
    );
  }

  const saleId = sale.id;
  const saleItems = sale.items;
  const returns = getSaleReturns(session.tenant_id)
    .filter((r) => r.sale_id === saleId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function returnedQtyFor(productId: string, serialId: string | undefined): number {
    return returns.reduce(
      (sum, r) =>
        sum +
        r.items
          .filter(
            (ri) =>
              ri.product_id === productId && (serialId ? ri.serial_id === serialId : !ri.serial_id),
          )
          .reduce((s, ri) => s + ri.quantity, 0),
      0,
    );
  }

  function handleReturnSubmit() {
    setReturnError(null);
    if (!returnReason.trim()) {
      setReturnError("سبب الإرجاع مطلوب");
      return;
    }
    const items = saleItems
      .map((line, index) => {
        const qty = Number(returnQuantities[index] ?? "0");
        if (qty <= 0) return null;
        return {
          product_id: line.product_id,
          ...(line.serial_id && { serial_id: line.serial_id }),
          quantity: qty,
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (items.length === 0) {
      setReturnError("أدخل كمية إرجاع لصنف واحد على الأقل");
      return;
    }
    try {
      createReturn({ sale_id: saleId, items, reason: returnReason }, actorUserId);
      setReturnQuantities({});
      setReturnReason("");
      setShowReturnForm(false);
      setReturnSuccess(true);
      setTimeout(() => setReturnSuccess(false), 3000);
    } catch (e) {
      setReturnError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-2xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">فاتورة بيع</h1>
          <div className="flex items-center gap-2">
            {sale.status !== "cancelled" && !showReturnForm && (
              <button
                onClick={() => setShowReturnForm(true)}
                className="rounded-md border border-input px-3 py-1.5 text-sm font-medium text-foreground hover:bg-accent"
              >
                إرجاع
              </button>
            )}
            <Link
              to="/sales/new"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              + بيع جديد
            </Link>
          </div>
        </div>

        {returnSuccess && <p className="mt-3 text-sm text-success">تم تسجيل الإرجاع ✓</p>}

        {showReturnForm && (
          <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">
              إرجاع صنف (§79/§81 — سيريال يدخل تحت الفحص، مش متاح فورًا)
            </h2>
            <div className="space-y-2">
              {sale.items.map((line, index) => {
                const alreadyReturned = returnedQtyFor(line.product_id, line.serial_id);
                const remaining = line.quantity - alreadyReturned;
                if (remaining <= 0) return null;
                return (
                  <div
                    key={index}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-2"
                  >
                    <span className="text-sm text-foreground">
                      {line.product_name}
                      {line.serial_number && (
                        <span className="text-muted-foreground" dir="ltr">
                          {" "}
                          ({line.serial_number})
                        </span>
                      )}
                    </span>
                    <label className="flex items-center gap-2 text-xs text-muted-foreground">
                      الكمية للإرجاع (متاح {remaining})
                      <input
                        type="number"
                        min="0"
                        max={remaining}
                        value={returnQuantities[index] ?? ""}
                        onChange={(e) =>
                          setReturnQuantities((prev) => ({ ...prev, [index]: e.target.value }))
                        }
                        className="form-input w-20"
                        dir="ltr"
                      />
                    </label>
                  </div>
                );
              })}
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">سبب الإرجاع *</span>
              <input
                value={returnReason}
                onChange={(e) => setReturnReason(e.target.value)}
                className="form-input"
              />
            </label>
            <div className="flex gap-2">
              <button
                onClick={handleReturnSubmit}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تأكيد الإرجاع
              </button>
              <button
                onClick={() => setShowReturnForm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
            {returnError && <p className="text-sm text-destructive">{returnError}</p>}
          </div>
        )}

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

        {returns.length > 0 && (
          <div className="mt-6">
            <h2 className="text-sm font-bold text-foreground">مرتجعات هذه الفاتورة</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">رقم المرتجع</th>
                    <th className="px-4 py-2 font-medium">المبلغ المسترد</th>
                    <th className="px-4 py-2 font-medium">السبب</th>
                    <th className="px-4 py-2 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {returns.map((r) => (
                    <tr key={r.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 font-medium text-foreground" dir="ltr">
                        {r.return_number}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                        {r.refund_amount.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-2 text-muted-foreground">{r.reason}</td>
                      <td className="px-4 py-2 text-xs text-muted-foreground" dir="ltr">
                        {new Date(r.created_at).toLocaleString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
