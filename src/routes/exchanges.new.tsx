import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { createExchange, getProductSerials, getProducts, getSales } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/exchanges/new")({
  component: NewExchangePage,
});

type ReturnLine = {
  product_id: string;
  product_name: string;
  serial_id?: string;
  serial_number?: string;
  quantity: number;
  unit_price: number;
};

type NewLine = {
  product_id: string;
  product_name: string;
  serial_id?: string;
  serial_number?: string;
  quantity: number;
  unit_price: number;
};

function NewExchangePage() {
  const session = useRequireSession();
  const navigate = useNavigate();
  const [invoiceQuery, setInvoiceQuery] = useState("");
  const [saleId, setSaleId] = useState("");
  const [returnedLines, setReturnedLines] = useState<ReturnLine[]>([]);
  const [newLines, setNewLines] = useState<NewLine[]>([]);
  const [selectedReturnIndex, setSelectedReturnIndex] = useState("");
  const [selectedNewProductId, setSelectedNewProductId] = useState("");
  const [newSerialId, setNewSerialId] = useState("");
  const [newQuantity, setNewQuantity] = useState("1");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;
  const actorUserId = session.user_id;

  const matchingSales = invoiceQuery.trim()
    ? getSales().filter((s) =>
        s.invoice_number.toLowerCase().includes(invoiceQuery.trim().toLowerCase()),
      )
    : [];
  const sale = getSales().find((s) => s.id === saleId);
  const products = getProducts().filter((p) => p.active);
  const newProduct = products.find((p) => p.id === selectedNewProductId);
  const availableSerials = newProduct?.serial_required
    ? getProductSerials().filter((s) => s.product_id === newProduct.id && s.status === "available")
    : [];

  function selectSale(id: string) {
    setSaleId(id);
    setInvoiceQuery("");
    setReturnedLines([]);
    setNewLines([]);
  }

  function addReturnLine() {
    setError(null);
    if (!sale || !selectedReturnIndex) {
      setError("اختر صنف من الفاتورة للإرجاع");
      return;
    }
    const line = sale.items[Number(selectedReturnIndex)];
    if (!line) return;
    if (
      returnedLines.some((r) =>
        line.serial_id ? r.serial_id === line.serial_id : r.product_id === line.product_id,
      )
    ) {
      setError("الصنف ده متضاف بالفعل");
      return;
    }
    setReturnedLines((prev) => [
      ...prev,
      {
        product_id: line.product_id,
        product_name: line.product_name,
        ...(line.serial_id && { serial_id: line.serial_id, serial_number: line.serial_number }),
        quantity: line.serial_id ? 1 : line.quantity,
        unit_price: line.unit_price,
      },
    ]);
    setSelectedReturnIndex("");
  }

  function addNewLine() {
    setError(null);
    if (!newProduct) {
      setError("اختر جهاز للاستبدال به");
      return;
    }
    if (newProduct.serial_required) {
      if (!newSerialId) {
        setError("اختر سيريال");
        return;
      }
      const serial = availableSerials.find((s) => s.id === newSerialId);
      if (!serial) return;
      setNewLines((prev) => [
        ...prev,
        {
          product_id: newProduct.id,
          product_name: newProduct.name,
          serial_id: serial.id,
          serial_number: serial.serial_number,
          quantity: 1,
          unit_price: newProduct.cash_price,
        },
      ]);
      setNewSerialId("");
    } else {
      const qty = Number(newQuantity) || 0;
      if (qty <= 0) {
        setError("كمية غير صحيحة");
        return;
      }
      setNewLines((prev) => [
        ...prev,
        {
          product_id: newProduct.id,
          product_name: newProduct.name,
          quantity: qty,
          unit_price: newProduct.cash_price,
        },
      ]);
      setNewQuantity("1");
    }
    setSelectedNewProductId("");
  }

  const returnedValue = returnedLines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const newValue = newLines.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const priceDifference = Math.round((newValue - returnedValue) * 100) / 100;

  function handleConfirm() {
    setError(null);
    if (!sale) return;
    if (!reason.trim()) {
      setError("سبب الاستبدال مطلوب");
      return;
    }
    try {
      createExchange(
        {
          original_sale_id: sale.id,
          returned_items: returnedLines.map((l) => ({
            product_id: l.product_id,
            ...(l.serial_id && { serial_id: l.serial_id }),
            quantity: l.quantity,
          })),
          new_items: newLines.map((l) => ({
            product_id: l.product_id,
            ...(l.serial_id && { serial_id: l.serial_id }),
            quantity: l.quantity,
          })),
          reason,
        },
        actorUserId,
      );
      void navigate({ to: "/sales/$id", params: { id: sale.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">استبدال جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §82 — إرجاع أصناف من فاتورة نقدية أصلية + بيع أصناف جديدة، وتسوية الفرق فقط.
        </p>

        {!sale ? (
          <div className="mt-4">
            <label className="block max-w-sm space-y-1">
              <span className="text-xs font-medium text-foreground">ابحث برقم الفاتورة</span>
              <input
                value={invoiceQuery}
                onChange={(e) => setInvoiceQuery(e.target.value)}
                className="form-input"
                dir="ltr"
                placeholder="INV-2026-000001"
              />
            </label>
            {matchingSales.length > 0 && (
              <div className="mt-2 max-w-sm overflow-hidden rounded-md border border-border bg-card">
                {matchingSales.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => selectSale(s.id)}
                    className="block w-full px-3 py-2 text-right text-sm hover:bg-accent"
                  >
                    <span dir="ltr">{s.invoice_number}</span> — {s.customer_name}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <>
            <p className="mt-4 text-sm text-muted-foreground">
              الفاتورة الأصلية: <span dir="ltr">{sale.invoice_number}</span> — {sale.customer_name}
            </p>

            <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2">
              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-bold text-foreground">أصناف مرتجعة</h2>
                <div className="mt-3 flex gap-2">
                  <select
                    value={selectedReturnIndex}
                    onChange={(e) => setSelectedReturnIndex(e.target.value)}
                    className="form-input"
                  >
                    <option value="">اختر صنف من الفاتورة</option>
                    {sale.items.map((line, i) => (
                      <option key={i} value={i}>
                        {line.product_name}
                        {line.serial_number ? ` (${line.serial_number})` : ` × ${line.quantity}`}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={addReturnLine}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    إضافة
                  </button>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {returnedLines.map((l, i) => (
                    <li key={i} className="flex justify-between border-b border-border pb-1">
                      <span>
                        {l.product_name}{" "}
                        {l.serial_number ? `(${l.serial_number})` : `× ${l.quantity}`}
                      </span>
                      <span dir="ltr">{(l.unit_price * l.quantity).toLocaleString("ar-EG")}</span>
                    </li>
                  ))}
                  {returnedLines.length === 0 && (
                    <li className="text-muted-foreground">لا يوجد أصناف مضافة.</li>
                  )}
                </ul>
                <p className="mt-2 text-sm font-bold text-foreground" dir="ltr">
                  إجمالي المرتجع: {returnedValue.toLocaleString("ar-EG")} ج.م
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <h2 className="text-sm font-bold text-foreground">
                  أصناف جديدة (بسعر البيع النقدي)
                </h2>
                <div className="mt-3 space-y-2">
                  <select
                    value={selectedNewProductId}
                    onChange={(e) => {
                      setSelectedNewProductId(e.target.value);
                      setNewSerialId("");
                    }}
                    className="form-input"
                  >
                    <option value="">اختر جهاز</option>
                    {products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} — {p.cash_price.toLocaleString("ar-EG")} ج.م
                      </option>
                    ))}
                  </select>
                  {newProduct?.serial_required ? (
                    <select
                      value={newSerialId}
                      onChange={(e) => setNewSerialId(e.target.value)}
                      className="form-input"
                    >
                      <option value="">اختر سيريال</option>
                      {availableSerials.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.serial_number}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="number"
                      min="1"
                      value={newQuantity}
                      onChange={(e) => setNewQuantity(e.target.value)}
                      className="form-input"
                      dir="ltr"
                      placeholder="الكمية"
                    />
                  )}
                  <button
                    onClick={addNewLine}
                    className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    إضافة
                  </button>
                </div>
                <ul className="mt-3 space-y-1 text-sm">
                  {newLines.map((l, i) => (
                    <li key={i} className="flex justify-between border-b border-border pb-1">
                      <span>
                        {l.product_name}{" "}
                        {l.serial_number ? `(${l.serial_number})` : `× ${l.quantity}`}
                      </span>
                      <span dir="ltr">{(l.unit_price * l.quantity).toLocaleString("ar-EG")}</span>
                    </li>
                  ))}
                  {newLines.length === 0 && (
                    <li className="text-muted-foreground">لا يوجد أصناف مضافة.</li>
                  )}
                </ul>
                <p className="mt-2 text-sm font-bold text-foreground" dir="ltr">
                  إجمالي الجديد: {newValue.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
            </div>

            <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
              <p className="text-lg font-bold text-foreground" dir="ltr">
                {priceDifference > 0
                  ? `العميل يدفع فرق: ${priceDifference.toLocaleString("ar-EG")} ج.م`
                  : priceDifference < 0
                    ? `يُرد للعميل: ${Math.abs(priceDifference).toLocaleString("ar-EG")} ج.م`
                    : "لا يوجد فرق"}
              </p>
              <label className="mt-3 block space-y-1">
                <span className="text-xs font-medium text-foreground">سبب الاستبدال *</span>
                <input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  className="form-input"
                />
              </label>
              {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
              <button
                onClick={handleConfirm}
                disabled={returnedLines.length === 0 || newLines.length === 0}
                className="mt-4 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                تأكيد الاستبدال
              </button>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
