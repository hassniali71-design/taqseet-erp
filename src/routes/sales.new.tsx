import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { SearchPicker } from "@/components/ui/SearchPicker";
import { subscribeData } from "@/lib/data-store";
import {
  computeProductStock,
  dateInputToTimestamp,
  useCreateSale,
  useCurrentTenantSettings,
  useCustomers,
  useInventoryMovements,
  useProductSerials,
  useProducts,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/sales/new")({
  component: NewSalePage,
});

type CartLine = {
  product_id: string;
  serial_id?: string;
  quantity: number;
  // Snapshot for display only — createSale re-resolves everything from the store.
  product_name: string;
  serial_number?: string;
  unit_price: number;
};

function NewSalePage() {
  const session = useRequireSession();
  const navigate = useNavigate();
  const [, forceRerender] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSerialId, setSelectedSerialId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [discountPct, setDiscountPct] = useState("0");
  const [returnWindowDays, setReturnWindowDays] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: settings } = useCurrentTenantSettings(session?.tenant_id);
  const { data: allCustomers = [] } = useCustomers(session?.tenant_id);
  const { data: allProducts = [] } = useProducts(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const createSaleMutation = useCreateSale(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;
  const employeeDiscountLimitPct = settings?.employee_discount_limit_pct ?? 5;

  const customers = allCustomers.filter((c) => c.status === "active");
  const products = allProducts.filter((p) => p.active);
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const availableSerials = selectedProduct?.serial_required
    ? allSerials.filter((s) => s.product_id === selectedProduct.id && s.status === "available")
    : [];
  const cartedSerialIds = new Set(cart.map((l) => l.serial_id).filter(Boolean));
  const usableSerials = availableSerials.filter((s) => !cartedSerialIds.has(s.id));
  const stockForSelected = selectedProduct
    ? computeProductStock(
        selectedProduct.id,
        selectedProduct.serial_required,
        allSerials,
        allMovements,
      )
    : 0;
  const alreadyCartedQty = cart
    .filter((l) => l.product_id === selectedProductId)
    .reduce((sum, l) => sum + l.quantity, 0);
  const remainingStock = stockForSelected - alreadyCartedQty;

  function addLine() {
    setError(null);
    if (!selectedProduct) {
      setError("اختر جهاز أولًا");
      return;
    }
    if (selectedProduct.serial_required) {
      if (!selectedSerialId) {
        setError("اختر سيريال");
        return;
      }
      const serial = usableSerials.find((s) => s.id === selectedSerialId);
      if (!serial) {
        setError("السيريال غير متاح");
        return;
      }
      setCart((prev) => [
        ...prev,
        {
          product_id: selectedProduct.id,
          serial_id: serial.id,
          serial_number: serial.serial_number,
          product_name: selectedProduct.name,
          quantity: 1,
          unit_price: selectedProduct.cash_price,
        },
      ]);
      setSelectedSerialId("");
    } else {
      const qty = Number(quantity) || 0;
      if (qty <= 0 || qty > remainingStock) {
        setError(`كمية غير صحيحة (متاح ${remainingStock})`);
        return;
      }
      setCart((prev) => [
        ...prev,
        {
          product_id: selectedProduct.id,
          product_name: selectedProduct.name,
          quantity: qty,
          unit_price: selectedProduct.cash_price,
        },
      ]);
      setQuantity("1");
    }
    setSelectedProductId("");
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const discount = Math.round(subtotal * ((Number(discountPct) || 0) / 100) * 100) / 100;
  const total = subtotal - discount;

  function handleConfirm() {
    setError(null);
    createSaleMutation.mutate(
      {
        input: {
          customer_id: customerId || null,
          items: cart.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            ...(l.serial_id && { serial_id: l.serial_id }),
          })),
          discount_pct: Number(discountPct) || 0,
          ...(returnWindowDays && { return_window_days: Number(returnWindowDays) }),
        },
        actorUserId,
        employeeDiscountLimitPct,
        ...(saleDate && { createdAt: dateInputToTimestamp(saleDate) }),
      },
      {
        onSuccess: (sale) => void navigate({ to: "/sales/$id", params: { id: sale.id } }),
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">بيع نقدي جديد</h1>

        <div className="mt-4">
          <label className="block max-w-sm space-y-1">
            <span className="text-xs font-medium text-foreground">العميل</span>
            <SearchPicker
              items={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
              value={customerId}
              onChange={setCustomerId}
              emptyLabel="عميل نقدي"
              placeholder="بحث باسم العميل..."
            />
          </label>
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">إضافة صنف</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-foreground">الجهاز</span>
              <SearchPicker
                items={products.map((p) => ({ id: p.id, label: p.name }))}
                value={selectedProductId}
                onChange={(id) => {
                  setSelectedProductId(id);
                  setSelectedSerialId("");
                }}
                placeholder="بحث باسم الجهاز..."
              />
            </label>

            {selectedProduct?.serial_required ? (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">السيريال</span>
                <select
                  value={selectedSerialId}
                  onChange={(e) => setSelectedSerialId(e.target.value)}
                  className="form-input"
                >
                  <option value="">اختر سيريال</option>
                  {usableSerials.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.serial_number}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">الكمية</span>
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
              </label>
            )}

            <div className="flex items-end">
              <button
                onClick={addLine}
                type="button"
                className="w-full rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                + أضف للفاتورة
              </button>
            </div>
          </div>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الصنف</th>
                <th className="px-4 py-3 font-medium">السيريال</th>
                <th className="px-4 py-3 font-medium">الكمية</th>
                <th className="px-4 py-3 font-medium">السعر</th>
                <th className="px-4 py-3 font-medium">الإجمالي</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {cart.map((line, i) => (
                <tr key={i} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{line.product_name}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {line.serial_number ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {line.quantity}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {line.unit_price.toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {(line.unit_price * line.quantity).toLocaleString("ar-EG")}
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
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    الفاتورة فاضية — أضف صنف من فوق.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <div className="flex flex-wrap items-end gap-4">
            <label className="block max-w-xs space-y-1">
              <span className="text-xs font-medium text-foreground">
                نسبة الخصم % (الحد الأقصى {employeeDiscountLimitPct}%)
              </span>
              <input
                type="number"
                min="0"
                max={employeeDiscountLimitPct}
                value={discountPct}
                onChange={(e) => setDiscountPct(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block max-w-xs space-y-1">
              <span className="text-xs font-medium text-foreground">
                مدة استرجاع/استبدال مخصصة (يوم — اختياري)
              </span>
              <input
                type="number"
                min="0"
                value={returnWindowDays}
                onChange={(e) => setReturnWindowDays(e.target.value)}
                className="form-input"
                dir="ltr"
                placeholder={`افتراضي: ${settings?.return_period_days ?? 14}`}
              />
            </label>
            <label className="block max-w-xs space-y-1">
              <span className="text-xs font-medium text-foreground">
                تاريخ العملية (سيبه فاضي لو دلوقتي)
              </span>
              <input
                type="date"
                value={saleDate}
                onChange={(e) => setSaleDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>

          <div className="text-left">
            <p className="text-sm text-muted-foreground" dir="ltr">
              الإجمالي قبل الخصم: {subtotal.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-sm text-muted-foreground" dir="ltr">
              الخصم: {discount.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="text-xl font-bold text-foreground" dir="ltr">
              الصافي: {total.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>

        <button
          onClick={handleConfirm}
          disabled={cart.length === 0 || createSaleMutation.isPending}
          className="mt-4 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createSaleMutation.isPending ? "جارٍ الحفظ..." : "تأكيد البيع"}
        </button>
      </main>
    </div>
  );
}
