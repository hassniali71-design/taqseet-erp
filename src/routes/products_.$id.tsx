import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getInventoryMovements,
  getProductSerials,
  getProductStock,
  getProducts,
  receiveStock,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { SerialStatus } from "@/types";

export const Route = createFileRoute("/products_/$id")({
  component: ProductDetailPage,
  loader: ({ params }) => {
    // Router loader — runs outside React/session context, so this is only an existence check
    // (unfiltered by design). The component below re-looks-up the product scoped to the
    // signed-in session's tenant and renders its own "not found" state for a foreign-tenant id.
    const product = getProducts().find((p) => p.id === params.id);
    if (!product) throw notFound();
    return null;
  },
});

const SERIAL_STATUS_LABELS: Record<SerialStatus, string> = {
  available: "متاح",
  sold: "مباع",
  returned: "مرتجع",
  inspection: "تحت الفحص",
  damaged: "تالف",
};

const SERIAL_STATUS_CLASS: Record<SerialStatus, string> = {
  available: "bg-success/15 text-success",
  sold: "bg-primary/15 text-primary",
  returned: "bg-warning/15 text-warning",
  inspection: "bg-muted text-muted-foreground",
  damaged: "bg-destructive/15 text-destructive",
};

const MOVEMENT_TYPE_LABELS: Record<string, string> = {
  receipt: "استلام",
  sale: "بيع",
  return: "مرتجع",
  adjustment: "تسوية جرد",
};

function ProductDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [showReceive, setShowReceive] = useState(false);
  const [quantity, setQuantity] = useState("1");
  const [serialInputs, setSerialInputs] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const product = getProducts(session.tenant_id).find((p) => p.id === id);
  if (!product) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-5xl px-4 py-8 text-center text-muted-foreground">
          المنتج غير موجود.{" "}
          <Link to="/products" className="text-primary hover:underline">
            العودة للأجهزة
          </Link>
        </main>
      </div>
    );
  }

  const serialRequired = product.serial_required;
  const stock = getProductStock(id, product);
  const serials = getProductSerials(session.tenant_id)
    .filter((s) => s.product_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const movements = getInventoryMovements(session.tenant_id)
    .filter((m) => m.product_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function openReceiveForm() {
    setQuantity("1");
    setSerialInputs([""]);
    setError(null);
    setShowReceive(true);
  }

  function onQuantityChange(value: string) {
    setQuantity(value);
    if (serialRequired) {
      const n = Math.max(1, Number(value) || 1);
      setSerialInputs((prev) => {
        const next = [...prev];
        while (next.length < n) next.push("");
        return next.slice(0, n);
      });
    }
  }

  function handleReceive(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      receiveStock(
        id,
        Number(quantity) || 0,
        serialRequired ? serialInputs : undefined,
        actorUserId,
        "استلام يدوي",
      );
      setShowReceive(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <Link to="/products" className="text-xs text-muted-foreground hover:underline">
          ← كل الأجهزة
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{product.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              {product.code} · {[product.brand, product.model].filter(Boolean).join(" / ")}
            </p>
          </div>
          {!showReceive && (
            <button
              onClick={openReceiveForm}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + استلام كمية
            </button>
          )}
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">المخزون الحالي</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {stock}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">السعر النقدي</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {product.cash_price.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">سعر التقسيط</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {product.installment_price.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>

        {showReceive && (
          <form
            onSubmit={handleReceive}
            className="mt-6 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">استلام كمية جديدة</h2>
            <label className="block max-w-xs space-y-1">
              <span className="text-xs font-medium text-foreground">الكمية</span>
              <input
                type="number"
                min="1"
                value={quantity}
                onChange={(e) => onQuantityChange(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>

            {product.serial_required && (
              <div className="space-y-2">
                <span className="text-xs font-medium text-foreground">
                  أرقام السيريال ({serialInputs.length})
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {serialInputs.map((value, i) => (
                    <input
                      key={i}
                      required
                      value={value}
                      onChange={(e) => {
                        const next = [...serialInputs];
                        next[i] = e.target.value;
                        setSerialInputs(next);
                      }}
                      placeholder={`سيريال #${i + 1}`}
                      className="form-input"
                      dir="ltr"
                    />
                  ))}
                </div>
              </div>
            )}

            {error && <p className="text-sm text-destructive">{error}</p>}

            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تأكيد الاستلام
              </button>
              <button
                type="button"
                onClick={() => setShowReceive(false)}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        {product.serial_required && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">السيريالات</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">السيريال</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">تاريخ الإضافة</th>
                  </tr>
                </thead>
                <tbody>
                  {serials.map((serial) => (
                    <tr key={serial.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                        {serial.serial_number}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${SERIAL_STATUS_CLASS[serial.status]}`}
                        >
                          {SERIAL_STATUS_LABELS[serial.status]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {new Date(serial.created_at).toLocaleDateString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                  {serials.length === 0 && (
                    <tr>
                      <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                        لا توجد سيريالات بعد.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">حركة المخزون</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">الكمية</th>
                  <th className="px-4 py-3 font-medium">قبل</th>
                  <th className="px-4 py-3 font-medium">بعد</th>
                  <th className="px-4 py-3 font-medium">السبب</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      {MOVEMENT_TYPE_LABELS[m.type] ?? m.type}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${m.quantity >= 0 ? "text-success" : "text-destructive"}`}
                      dir="ltr"
                    >
                      {m.quantity >= 0 ? "+" : ""}
                      {m.quantity}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {m.before}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {m.after}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.reason ?? "—"}</td>
                    <td
                      className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground"
                      dir="ltr"
                    >
                      {new Date(m.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      لا توجد حركات مخزون بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
