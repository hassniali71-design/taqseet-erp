import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { PartnerDealPicker } from "@/components/ui/PartnerDealPicker";
import { SearchPicker } from "@/components/ui/SearchPicker";
import { subscribeData } from "@/lib/data-store";
import {
  computePartnerDealPreview,
  computeProductStock,
  dateInputToTimestamp,
  settlePartnersForDeal,
  useCreateCustomer,
  useCreateProduct,
  useCreateSale,
  useCurrentTenantSettings,
  useCustomers,
  useInventoryMovements,
  usePartners,
  useProductSerials,
  useProducts,
  usePurchases,
  useReceiveStock,
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
  const [unitPriceOverride, setUnitPriceOverride] = useState("");
  const [discountPct, setDiscountPct] = useState("0");
  const [returnWindowDays, setReturnWindowDays] = useState("");
  const [saleDate, setSaleDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [partnerSplits, setPartnerSplits] = useState<Record<string, string>>({});
  const [partnerProfitShares, setPartnerProfitShares] = useState<Record<string, string>>({});

  const [showNewCustomerForm, setShowNewCustomerForm] = useState(false);
  const [newCustomerName, setNewCustomerName] = useState("");
  const [newCustomerAddress, setNewCustomerAddress] = useState("");
  const [newCustomerPhone, setNewCustomerPhone] = useState("");
  const [newCustomerNotes, setNewCustomerNotes] = useState("");
  const [newCustomerError, setNewCustomerError] = useState<string | null>(null);

  const [showNewProductForm, setShowNewProductForm] = useState(false);
  const [newProductName, setNewProductName] = useState("");
  const [newProductCost, setNewProductCost] = useState("");
  const [newProductPrice, setNewProductPrice] = useState("");
  const [newProductQty, setNewProductQty] = useState("1");
  const [newProductError, setNewProductError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: settings } = useCurrentTenantSettings(session?.tenant_id);
  const { data: allCustomers = [] } = useCustomers(session?.tenant_id);
  const { data: allProducts = [] } = useProducts(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const { data: allPartners = [] } = usePartners(session?.tenant_id);
  const { data: allPurchases = [] } = usePurchases(session?.tenant_id);
  const createSaleMutation = useCreateSale(session?.tenant_id);
  const createCustomerMutation = useCreateCustomer(session?.tenant_id);
  const createProductMutation = useCreateProduct(session?.tenant_id);
  const receiveStockMutation = useReceiveStock(session?.tenant_id);

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
    const unitPrice = Number(unitPriceOverride) || selectedProduct.cash_price;
    if (unitPrice <= 0) {
      setError("السعر لازم يكون أكبر من صفر");
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
          unit_price: unitPrice,
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
          unit_price: unitPrice,
        },
      ]);
      setQuantity("1");
    }
    setSelectedProductId("");
    setUnitPriceOverride("");
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  // إنشاء عميل جديد من جوّه شاشة البيع نفسها — لعميل جاي "من بره" مش مسجّل عندنا، بدل ما
  // البائع يضطر يسيب البيع ويروح صفحة العملاء الأول. نفس مبدأ الحد الأدنى المطلوب (الاسم
  // والعنوان بس)، والعميل الجديد ده بيظهر عادي بعد كده في صفحة /customers.
  async function handleCreateNewCustomer() {
    setNewCustomerError(null);
    if (!newCustomerName.trim()) {
      setNewCustomerError("اسم العميل مطلوب");
      return;
    }
    if (!newCustomerAddress.trim()) {
      setNewCustomerError("عنوان العميل مطلوب");
      return;
    }
    try {
      const customer = await createCustomerMutation.mutateAsync({
        input: {
          name: newCustomerName.trim(),
          address: newCustomerAddress.trim(),
          ...(newCustomerPhone.trim() && { phone: newCustomerPhone.trim() }),
          ...(newCustomerNotes.trim() && { notes: newCustomerNotes.trim() }),
        },
        actorUserId,
      });
      setCustomerId(customer.id);
      setShowNewCustomerForm(false);
      setNewCustomerName("");
      setNewCustomerAddress("");
      setNewCustomerPhone("");
      setNewCustomerNotes("");
    } catch (e) {
      setNewCustomerError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  // إنشاء جهاز جديد من جوّه شاشة البيع نفسها — لعميل جاي بجهازه هو (مش من مخزون المحل)
  // وعايز يبيعه فورًا. بيتسجل بالكمية بس (بدون سيريال، زي أي إضافة سريعة تانية في المشروع)،
  // والكمية المدخلة بتتسجل فورًا كمخزون افتتاحي عشان تبقى متاحة للبيع على طول في نفس
  // الفاتورة، والجهاز الجديد ده بيظهر عادي بعد كده في صفحة /products.
  async function handleCreateNewProduct() {
    setNewProductError(null);
    if (!newProductName.trim()) {
      setNewProductError("اسم الجهاز مطلوب");
      return;
    }
    const price = Number(newProductPrice);
    if (!newProductPrice || price <= 0) {
      setNewProductError("أدخل سعر بيع صحيح");
      return;
    }
    const qty = Number(newProductQty) || 0;
    if (qty <= 0) {
      setNewProductError("أدخل كمية صحيحة");
      return;
    }
    const cost = Number(newProductCost);
    if (!newProductCost || cost <= 0) {
      setNewProductError(
        "أدخل تكلفة شراء صحيحة (لازم تكون أكبر من صفر) — عليها بيتحسب نصيب الشركاء من الربح",
      );
      return;
    }
    try {
      const product = await createProductMutation.mutateAsync({
        input: {
          name: newProductName.trim(),
          unit: "قطعة",
          cost_price: cost,
          cash_price: price,
          installment_price: price,
          min_stock: 0,
          max_stock: 0,
          serial_required: false,
        },
        actorUserId,
      });
      await receiveStockMutation.mutateAsync({
        product,
        quantity: qty,
        serialNumbers: undefined,
        actorUserId,
        reference: "إضافة سريعة وقت البيع",
      });
      setSelectedProductId(product.id);
      setUnitPriceOverride(String(price));
      setQuantity(String(qty));
      setShowNewProductForm(false);
      setNewProductName("");
      setNewProductCost("");
      setNewProductPrice("");
      setNewProductQty("1");
    } catch (e) {
      setNewProductError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const discount = Math.round(subtotal * ((Number(discountPct) || 0) / 100) * 100) / 100;
  const total = subtotal - discount;
  const cartCost = cart.reduce((sum, l) => {
    const product = allProducts.find((p) => p.id === l.product_id);
    return sum + (product?.cost_price ?? 0) * l.quantity;
  }, 0);
  const distinctProductIds = new Set(cart.map((l) => l.product_id));
  const singleProductId = distinctProductIds.size === 1 ? cart[0]?.product_id : undefined;
  const activePartners = allPartners.filter((p) => p.active);

  function handleConfirm() {
    setError(null);
    createSaleMutation.mutate(
      {
        input: {
          customer_id: customerId || null,
          items: cart.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            unit_price: l.unit_price,
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
        onSuccess: (sale) => {
          if (selectedPartnerIds.length > 0 && session) {
            void settlePartnersForDeal(
              session.tenant_id,
              actorUserId,
              sale.invoice_number,
              sale.id,
              undefined,
              selectedPartnerIds.map((partnerId) => {
                const partner = activePartners.find((p) => p.id === partnerId);
                const splitPct = Number(partnerSplits[partnerId]) || 0;
                const profitSharePct =
                  Number(partnerProfitShares[partnerId] ?? partner?.profit_share_pct) || 0;
                const preview = computePartnerDealPreview(
                  subtotal,
                  cartCost,
                  splitPct,
                  profitSharePct,
                );
                return {
                  partnerId,
                  ...(singleProductId ? { productId: singleProductId } : {}),
                  costRecovered: preview.costRecovered,
                  profitAmount: preview.profitAmount,
                  dealValue: subtotal,
                  splitPct,
                  profitSharePct,
                };
              }),
            );
          }
          void navigate({ to: "/sales/$id", params: { id: sale.id } });
        },
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
              extraAction={{
                label: "+ إضافة عميل جديد",
                onSelect: () => {
                  setShowNewCustomerForm(true);
                  setCustomerId("");
                },
              }}
            />
          </label>

          {showNewCustomerForm && (
            <div className="mt-3 max-w-xl space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-bold text-foreground">
                عميل جديد — هيتضاف لقائمة العملاء ويتسجل عليه البيع ده فورًا
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الاسم *</span>
                  <input
                    value={newCustomerName}
                    onChange={(e) => setNewCustomerName(e.target.value)}
                    className="form-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">العنوان *</span>
                  <input
                    value={newCustomerAddress}
                    onChange={(e) => setNewCustomerAddress(e.target.value)}
                    className="form-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الهاتف (اختياري)</span>
                  <input
                    value={newCustomerPhone}
                    onChange={(e) => setNewCustomerPhone(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">ملاحظات (اختياري)</span>
                  <input
                    value={newCustomerNotes}
                    onChange={(e) => setNewCustomerNotes(e.target.value)}
                    className="form-input"
                  />
                </label>
              </div>
              {newCustomerError && <p className="text-sm text-destructive">{newCustomerError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateNewCustomer()}
                  disabled={createCustomerMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createCustomerMutation.isPending ? "جارٍ الإنشاء..." : "إنشاء واستخدام"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCustomerForm(false);
                    setNewCustomerError(null);
                  }}
                  className="rounded-md border border-input px-4 py-2 text-xs font-medium text-foreground hover:bg-accent"
                >
                  إلغاء
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">إضافة صنف</h2>
          <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-5">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium text-foreground">الجهاز</span>
              <SearchPicker
                items={products.map((p) => ({ id: p.id, label: p.name }))}
                value={selectedProductId}
                onChange={(id) => {
                  setSelectedProductId(id);
                  setSelectedSerialId("");
                  const product = products.find((p) => p.id === id);
                  setUnitPriceOverride(product ? String(product.cash_price) : "");
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

            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">سعر البيع</span>
              <input
                type="number"
                min="0"
                value={unitPriceOverride}
                onChange={(e) => setUnitPriceOverride(e.target.value)}
                placeholder={selectedProduct ? String(selectedProduct.cash_price) : ""}
                className="form-input"
                dir="ltr"
              />
            </label>

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

          {showNewProductForm && (
            <div className="mt-3 space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-3">
              <p className="text-xs font-bold text-foreground">
                جهاز جديد — هيتضاف لقائمة الأجهزة ويتسجل عليه الكمية دي فورًا جاهزة للبيع
              </p>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الاسم *</span>
                  <input
                    value={newProductName}
                    onChange={(e) => setNewProductName(e.target.value)}
                    className="form-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">تكلفته (بكام جابه) *</span>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    required
                    value={newProductCost}
                    onChange={(e) => setNewProductCost(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">سعر البيع *</span>
                  <input
                    type="number"
                    min="0"
                    value={newProductPrice}
                    onChange={(e) => setNewProductPrice(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الكمية معاه *</span>
                  <input
                    type="number"
                    min="1"
                    value={newProductQty}
                    onChange={(e) => setNewProductQty(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
              </div>
              {newProductError && <p className="text-sm text-destructive">{newProductError}</p>}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleCreateNewProduct()}
                  disabled={createProductMutation.isPending || receiveStockMutation.isPending}
                  className="rounded-md bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {createProductMutation.isPending || receiveStockMutation.isPending
                    ? "جارٍ الإنشاء..."
                    : "إنشاء واستخدام"}
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

          <p className="mt-2 text-xs text-muted-foreground">
            السعر الأساسي المسجّل على الجهاز معروض كمبدئي — تقدر تغيّره براحتك وقت البيع.
          </p>
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

        {cart.length > 0 && activePartners.length > 0 && (
          <PartnerDealPicker
            partners={activePartners}
            purchases={allPurchases}
            selectedIds={selectedPartnerIds}
            onSelectedIdsChange={setSelectedPartnerIds}
            splits={partnerSplits}
            onSplitsChange={setPartnerSplits}
            profitShares={partnerProfitShares}
            onProfitSharesChange={setPartnerProfitShares}
            cashSubtotal={subtotal}
            cost={cartCost}
            {...(singleProductId ? { productId: singleProductId } : {})}
          />
        )}

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
