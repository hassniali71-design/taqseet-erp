import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { createPurchase, getProducts, getSuppliers } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/purchases/new")({
  component: NewPurchasePage,
});

type CartLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  serial_numbers: string[];
};

function NewPurchasePage() {
  const session = useRequireSession();
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [unitCost, setUnitCost] = useState("");
  const [serialInputs, setSerialInputs] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);

  if (!session) return null;
  const actorUserId = session.user_id;

  const suppliers = getSuppliers().filter((s) => s.active);
  const products = getProducts().filter((p) => p.active);
  const selectedProduct = products.find((p) => p.id === selectedProductId);

  function onQuantityChange(value: string) {
    setQuantity(value);
    if (selectedProduct?.serial_required) {
      const n = Math.max(1, Number(value) || 1);
      setSerialInputs((prev) => {
        const next = [...prev];
        while (next.length < n) next.push("");
        return next.slice(0, n);
      });
    }
  }

  function addLine() {
    setError(null);
    if (!selectedProduct) {
      setError("اختر جهاز أولًا");
      return;
    }
    const qty = Number(quantity) || 0;
    const cost = Number(unitCost);
    if (qty <= 0) {
      setError("كمية غير صحيحة");
      return;
    }
    if (!unitCost || cost < 0) {
      setError("أدخل سعر تكلفة صحيح");
      return;
    }
    const serials = selectedProduct.serial_required
      ? serialInputs.map((s) => s.trim()).filter(Boolean)
      : [];
    if (selectedProduct.serial_required && serials.length !== qty) {
      setError(`أدخل ${qty} سيريال بالظبط`);
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qty,
        unit_cost: cost,
        serial_numbers: serials,
      },
    ]);
    setSelectedProductId("");
    setQuantity("1");
    setUnitCost("");
    setSerialInputs([""]);
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const total = cart.reduce((sum, l) => sum + l.unit_cost * l.quantity, 0);

  function handleConfirm() {
    setError(null);
    if (!supplierId) {
      setError("اختر مورد");
      return;
    }
    try {
      const purchase = createPurchase(
        {
          supplier_id: supplierId,
          items: cart.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_cost: l.unit_cost,
            ...(l.serial_numbers.length > 0 && { serial_numbers: l.serial_numbers }),
          })),
        },
        actorUserId,
      );
      void navigate({ to: "/purchases/$id", params: { id: purchase.id } });
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">أمر شراء جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §61-§64 — الاستلام هنا فوري: تأكيد الأمر يحدّث المخزون وينشئ السيريالات المطلوبة مباشرة.
        </p>

        <div className="mt-4">
          <label className="block max-w-sm space-y-1">
            <span className="text-xs font-medium text-foreground">المورد *</span>
            <select
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              className="form-input"
            >
              <option value="">اختر مورد</option>
              {suppliers.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.code})
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">إضافة صنف</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-foreground">الجهاز</span>
              <select
                value={selectedProductId}
                onChange={(e) => {
                  setSelectedProductId(e.target.value);
                  setSerialInputs([""]);
                }}
                className="form-input"
              >
                <option value="">اختر جهاز</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} (تكلفة حالية: {p.cost_price.toLocaleString("ar-EG")} ج.م)
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
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
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">سعر تكلفة الوحدة</span>
              <input
                type="number"
                min="0"
                value={unitCost}
                onChange={(e) => setUnitCost(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>

          {selectedProduct?.serial_required && (
            <div className="mt-3">
              <span className="text-xs font-medium text-foreground">
                السيريالات ({serialInputs.length})
              </span>
              <div className="mt-1 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {serialInputs.map((value, i) => (
                  <input
                    key={i}
                    value={value}
                    onChange={(e) =>
                      setSerialInputs((prev) =>
                        prev.map((v, idx) => (idx === i ? e.target.value : v)),
                      )
                    }
                    className="form-input"
                    dir="ltr"
                    placeholder={`سيريال ${i + 1}`}
                  />
                ))}
              </div>
            </div>
          )}

          <button
            onClick={addLine}
            type="button"
            className="mt-3 rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
          >
            + أضف للأمر
          </button>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الصنف</th>
                <th className="px-4 py-3 font-medium">الكمية</th>
                <th className="px-4 py-3 font-medium">سعر التكلفة</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{line.product_name}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {line.unit_cost.toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {(line.unit_cost * line.quantity).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-left">
                    <button
                      onClick={() => removeLine(i)}
                      className="text-xs font-medium text-destructive hover:underline"
                    >
                      حذف
                    </button>
                  </td>
                </tr>
              ))}
              {cart.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    الأمر فاضي — أضف صنف من فوق.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex items-center justify-between">
          <p className="text-xl font-bold text-foreground" dir="ltr">
            الإجمالي: {total.toLocaleString("ar-EG")} ج.م
          </p>
          <button
            onClick={handleConfirm}
            disabled={cart.length === 0}
            className="rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            تأكيد أمر الشراء
          </button>
        </div>
      </main>
    </div>
  );
}
