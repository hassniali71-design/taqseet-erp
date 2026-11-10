import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { DateInput } from "@/components/ui/DateInput";
import { SearchPicker } from "@/components/ui/SearchPicker";
import {
  useCreateGoodsProducts,
  useCreateProduct,
  useCreatePurchase,
  useCurrentTenantSettings,
  useProducts,
  useProductUnits,
  useSuppliers,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import { useTenantFeatures } from "@/hooks/use-tenant-features";
import { unitOptionsFor, unitQtyLabel } from "@/lib/units";
import { useErrorSound } from "@/hooks/use-error-sound";
import { playSound } from "@/lib/sounds";

export const Route = createFileRoute("/purchases/new")({
  component: NewPurchasePage,
});

type CartLine = {
  product_id: string;
  product_name: string;
  quantity: number;
  unit_cost: number;
  serial_numbers: string[];
  /** بند 89 — اتشرى بالدستة: «5 دستة»، و`quantity` بالقطعة. */
  unit_name?: string;
  unit_qty?: number;
};

function NewPurchasePage() {
  const session = useRequireSession();
  const navigate = useNavigate();
  const [supplierId, setSupplierId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [selectedUnitId, setSelectedUnitId] = useState(""); // بند 89 — "" = القطعة
  const [unitCost, setUnitCost] = useState("");
  const [serialInputs, setSerialInputs] = useState<string[]>([""]);
  const [error, setError] = useState<string | null>(null);
  useErrorSound(error);
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [returnPeriodDays, setReturnPeriodDays] = useState("");
  const [immediatePayment, setImmediatePayment] = useState("");
  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCash, setNewProductCash] = useState("");
  const [newProductBrand, setNewProductBrand] = useState("");
  const [newProductWarrantyMonths, setNewProductWarrantyMonths] = useState("");
  const [newProductError, setNewProductError] = useState<string | null>(null);
  // بند 90 — في محل الأدوات: الصنف الجديد من جوه الفاتورة بيتعمل «أدوات» (من غير سيريال ولا ضمان).
  const [newProductIsGoods, setNewProductIsGoods] = useState(true);
  const [newProductUnit, setNewProductUnit] = useState("قطعة");
  const [newProductFactor, setNewProductFactor] = useState("12");
  const [pendingUnit, setPendingUnit] = useState<{ productId: string; name: string } | null>(null);

  const { data: allSuppliers = [] } = useSuppliers(session?.tenant_id);
  const { data: allProducts = [] } = useProducts(session?.tenant_id);
  const { data: settings } = useCurrentTenantSettings(session?.tenant_id);
  const createPurchaseMutation = useCreatePurchase(session?.tenant_id);
  const createProductMutation = useCreateProduct(session?.tenant_id);
  const { goods_enabled: goodsEnabled } = useTenantFeatures(session?.tenant_id);
  const { data: allUnits = [] } = useProductUnits(session?.tenant_id, goodsEnabled);
  const createGoodsMutation = useCreateGoodsProducts(session?.tenant_id);
  // صنف أدوات جديد بالدستة: أول ما وحدته توصل من السيرفر تتختار لوحدها جنب الكمية.
  useEffect(() => {
    if (!pendingUnit) return;
    const unit = allUnits.find(
      (u) => u.product_id === pendingUnit.productId && u.name === pendingUnit.name,
    );
    if (unit) {
      setSelectedUnitId(unit.id);
      if (unit.cost_price != null) setUnitCost(String(unit.cost_price));
      setPendingUnit(null);
    }
  }, [pendingUnit, allUnits]);

  if (!session) return null;
  const actorUserId = session.user_id;

  const suppliers = allSuppliers.filter((s) => s.active);
  const products = allProducts.filter((p) => p.active);
  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const unitOptions = goodsEnabled ? unitOptionsFor(selectedProduct, allUnits) : [];
  const selectedUnit = unitOptions.find((u) => u.id === selectedUnitId);

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
    const factor = selectedProduct.serial_required ? 1 : (selectedUnit?.factor ?? 1);
    if (!Number.isInteger(qty * factor)) {
      setError("كمية غير صحيحة");
      return;
    }
    setCart((prev) => [
      ...prev,
      {
        product_id: selectedProduct.id,
        product_name: selectedProduct.name,
        quantity: qty * factor,
        unit_cost: factor > 1 ? cost / factor : cost,
        serial_numbers: serials,
        ...(factor > 1 && selectedUnit && { unit_name: selectedUnit.name, unit_qty: qty }),
      },
    ]);
    setSelectedProductId("");
    setSelectedUnitId("");
    setQuantity("1");
    setUnitCost("");
    setSerialInputs([""]);
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  async function handleCreateNewProduct() {
    setNewProductError(null);
    if (!newProductName.trim()) {
      setNewProductError("اسم الجهاز مطلوب");
      return;
    }
    const cash = Number(newProductCash);
    if (!newProductCash || cash < 0) {
      setNewProductError("أدخل سعر نقدي صحيح");
      return;
    }
    if (goodsEnabled && newProductIsGoods) {
      if (cash <= 0) {
        setNewProductError("سعر البيع لازم يكون أكبر من صفر");
        return;
      }
      const isPack = newProductUnit === "دستة" || newProductUnit === "كرتونة";
      const f = Math.floor(Number(newProductFactor) || 0);
      if (isPack && f < 2) {
        setNewProductError(`ال${newProductUnit} فيها كام قطعة؟`);
        return;
      }
      try {
        const created = (await createGoodsMutation.mutateAsync([
          isPack
            ? {
                name: newProductName.trim(),
                unit: "قطعة",
                cost_price: 0,
                cash_price: Math.round((cash / f) * 100) / 100,
                units: [{ name: newProductUnit, factor: f, cash_price: cash }],
              }
            : {
                name: newProductName.trim(),
                unit: newProductUnit,
                cost_price: 0,
                cash_price: cash,
              },
        ])) as Array<{ id: string }>;
        const product = created[0];
        if (!product) throw new Error("تعذّر إنشاء الصنف");
        setSelectedProductId(product.id);
        setSelectedUnitId("");
        if (isPack) setPendingUnit({ productId: product.id, name: newProductUnit });
        setSerialInputs([""]);
        setShowNewProductForm(false);
        setNewProductName("");
        setNewProductCash("");
        setNewProductUnit("قطعة");
        playSound("success");
      } catch (e) {
        setNewProductError(e instanceof Error ? e.message : "حدث خطأ");
      }
      return;
    }
    try {
      const product = await createProductMutation.mutateAsync({
        input: {
          name: newProductName.trim(),
          unit: "قطعة",
          cost_price: 0,
          cash_price: cash,
          // مفيش سعر تقسيط منفصل بيتحدد هنا (اتلغى المفهوم من النظام كله) — بيتشتق دايمًا وقت
          // البيع من السعر النقدي + الخطة/الفايدة المختارة.
          installment_price: cash,
          min_stock: 0,
          max_stock: 0,
          serial_required: false,
          ...(newProductBrand.trim() && { brand: newProductBrand.trim() }),
          ...(newProductWarrantyMonths && {
            warranty_months: Number(newProductWarrantyMonths) || 0,
          }),
        },
        actorUserId,
      });
      setSelectedProductId(product.id);
      setSerialInputs([""]);
      setShowNewProductForm(false);
      setNewProductName("");
      setNewProductCash("");
      setNewProductBrand("");
      setNewProductWarrantyMonths("");
    } catch (e) {
      setNewProductError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  // بنفس تقريب السيرفر لكل سطر (بند 89: تكلفة القطعة من الدستة ممكن تبقى كسر)
  const total =
    Math.round(
      cart.reduce((sum, l) => sum + Math.round(l.unit_cost * l.quantity * 100) / 100, 0) * 100,
    ) / 100;

  function handleConfirm() {
    setError(null);
    if (!supplierId) {
      setError("اختر مورد");
      return;
    }
    const immediatePaymentNum = Number(immediatePayment) || 0;
    if (immediatePaymentNum > total) {
      setError(`الدفعة الفورية أكبر من إجمالي أمر الشراء (${total.toLocaleString("ar-EG")} ج.م)`);
      return;
    }
    createPurchaseMutation.mutate(
      {
        input: {
          supplier_id: supplierId,
          items: cart.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_cost: l.unit_cost,
            ...(l.serial_numbers.length > 0 && { serial_numbers: l.serial_numbers }),
            ...(l.unit_name && l.unit_qty && { unit_name: l.unit_name, unit_qty: l.unit_qty }),
          })),
          ...(issueDate && { issue_date: issueDate }),
          ...(returnPeriodDays && { return_period_days: Number(returnPeriodDays) }),
          ...(immediatePaymentNum > 0 && { immediate_payment: immediatePaymentNum }),
        },
        actorUserId,
        costingMethod: settings?.costing_method ?? "average",
      },
      {
        onSuccess: (purchase) => {
          playSound("done");
          void navigate({ to: "/purchases/$id", params: { id: purchase.id } });
        },
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">أمر شراء جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          الاستلام هنا فوري: تأكيد الأمر يحدّث المخزون وينشئ السيريالات المطلوبة مباشرة.
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">المورد *</span>
            <SearchPicker
              items={suppliers.map((s) => ({ id: s.id, label: `${s.name} (${s.code})` }))}
              value={supplierId}
              onChange={setSupplierId}
              placeholder="بحث باسم المورد..."
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">تاريخ إصدار الفاتورة</span>
            <DateInput value={issueDate} onChange={(v) => setIssueDate(v)} />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">مدة إرجاع (أيام، اختياري)</span>
            <input
              type="number"
              min="0"
              value={returnPeriodDays}
              onChange={(e) => setReturnPeriodDays(e.target.value)}
              className="form-input"
              dir="ltr"
              placeholder="مثلًا: 14"
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
                  setSerialInputs([""]);
                  setSelectedUnitId("");
                }}
                placeholder="بحث باسم الجهاز..."
                extraAction={{
                  label: "+ إضافة جهاز جديد",
                  onSelect: () => {
                    setShowNewProductForm(true);
                    setSelectedProductId("");
                  },
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">الكمية</span>
              <div className="flex gap-1">
                <input
                  type="number"
                  min="1"
                  value={quantity}
                  onChange={(e) => onQuantityChange(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
                {unitOptions.length > 1 && !selectedProduct?.serial_required && (
                  <select
                    value={selectedUnitId}
                    onChange={(e) => {
                      setSelectedUnitId(e.target.value);
                      const u = unitOptions.find((o) => o.id === e.target.value);
                      if (u && u.costPrice > 0) setUnitCost(String(u.costPrice));
                    }}
                    className="form-input w-auto"
                    aria-label="الوحدة"
                  >
                    {unitOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                        {u.factor > 1 ? ` (${u.factor})` : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
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

          {showNewProductForm && (
            <div className="mt-3 space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-bold text-foreground">
                جهاز جديد — هيتضاف لقائمة الأجهزة ويتسجل عليه هذه الكمية فورًا
              </p>
              {goodsEnabled && (
                <div className="flex gap-2">
                  {(
                    [
                      [true, "🍽️ صنف أدوات منزلية"],
                      [false, "📱 جهاز"],
                    ] as const
                  ).map(([v, label]) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setNewProductIsGoods(v)}
                      className={
                        newProductIsGoods === v
                          ? "rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
                          : "rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      }
                    >
                      {label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الاسم *</span>
                  <input
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="form-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">السعر النقدي *</span>
                  <input
                    type="number"
                    min="0"
                    value={newProductCash}
                    onChange={(e) => setNewProductCash(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    سعر التقسيط بيتحسب تلقائيًا منه وقت البيع حسب الخطة والفايدة، مش محتاج تحدده
                    هنا.
                  </span>
                </label>
                {goodsEnabled && newProductIsGoods ? (
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">الوحدة</span>
                    <div className="flex gap-1">
                      <select
                        value={newProductUnit}
                        onChange={(e) => setNewProductUnit(e.target.value)}
                        className="form-input"
                      >
                        {["قطعة", "دستة", "طقم", "كرتونة", "علبة"].map((u) => (
                          <option key={u} value={u}>
                            {u}
                          </option>
                        ))}
                      </select>
                      {(newProductUnit === "دستة" || newProductUnit === "كرتونة") && (
                        <input
                          type="number"
                          min="2"
                          value={newProductFactor}
                          onChange={(e) => setNewProductFactor(e.target.value)}
                          className="form-input w-20"
                          dir="ltr"
                          aria-label="فيها كام قطعة"
                          placeholder="قطع"
                        />
                      )}
                    </div>
                  </label>
                ) : (
                  <>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-foreground">الماركة (اختياري)</span>
                      <input
                        value={newProductBrand}
                        onChange={(e) => setNewProductBrand(e.target.value)}
                        className="form-input"
                      />
                    </label>
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-foreground">
                        الضمان بالشهور (اختياري)
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={newProductWarrantyMonths}
                        onChange={(e) => setNewProductWarrantyMonths(e.target.value)}
                        className="form-input"
                        dir="ltr"
                      />
                    </label>
                  </>
                )}
              </div>
              <p className="text-[11px] text-muted-foreground">
                الجهاز الجديد ده هيتسجل بالكمية بس (بدون سيريال) — لو حابب تتبعه بالسيريال، سجّله من
                صفحة "الأجهزة" بدل كده وحط رقم سيريال لأي قطعة عايز تتبعها.
              </p>
              {newProductError && <p className="text-sm text-destructive">{newProductError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateNewProduct()}
                  disabled={createProductMutation.isPending || createGoodsMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createProductMutation.isPending ? "جارٍ الإنشاء..." : "إنشاء واستخدام"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewProductForm(false);
                    setNewProductError(null);
                  }}
                  className="rounded-md border border-input px-4 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}

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

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
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
                  <td className="px-4 py-3 text-muted-foreground">{unitQtyLabel(line)}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {(line.unit_qty
                      ? Math.round(((line.unit_cost * line.quantity) / line.unit_qty) * 100) / 100
                      : line.unit_cost
                    ).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {(Math.round(line.unit_cost * line.quantity * 100) / 100).toLocaleString(
                      "ar-EG",
                    )}
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

        <div className="mt-6 flex flex-wrap items-end justify-between gap-4">
          <label className="block max-w-xs space-y-1">
            <span className="text-xs font-medium text-foreground">
              دفعة فورية للمورد الآن (اختياري — سيبها فاضية لو كله على الحساب)
            </span>
            <input
              type="number"
              min="0"
              max={total || undefined}
              value={immediatePayment}
              onChange={(e) => setImmediatePayment(e.target.value)}
              className="form-input"
              dir="ltr"
              placeholder="0"
            />
          </label>

          <div className="text-left">
            <p className="text-xl font-bold text-foreground" dir="ltr">
              الإجمالي: {total.toLocaleString("ar-EG")} ج.م
            </p>
            <button
              onClick={handleConfirm}
              disabled={cart.length === 0 || createPurchaseMutation.isPending}
              className="mt-2 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {createPurchaseMutation.isPending ? "جارٍ الحفظ..." : "تأكيد أمر الشراء"}
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
