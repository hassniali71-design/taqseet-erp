import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { PartnerDealPicker } from "@/components/ui/PartnerDealPicker";
import { SearchPicker } from "@/components/ui/SearchPicker";
import { subscribeData } from "@/lib/data-store";
import { calculateFinance, generateSchedule } from "@/lib/finance-engine";
import {
  computeCustomerExposure,
  computeCustomerOnCreditHold,
  computePartnerDealPreview,
  computeProductStock,
  dateInputToTimestamp,
  settlePartnersForDeal,
  useCreateInstallmentContract,
  useCreateInstallmentPlan,
  useCurrentTenantSettings,
  useCustomers,
  useInstallmentContracts,
  useInstallmentPlans,
  useInstallments,
  useInventoryMovements,
  usePartners,
  useProductSerials,
  useProducts,
  usePurchases,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/sales/new-installment")({
  component: NewInstallmentSalePage,
});

type CartLine = {
  product_id: string;
  serial_id?: string;
  quantity: number;
  // Snapshot for display only — createInstallmentContract re-resolves everything from the store.
  product_name: string;
  serial_number?: string;
  unit_price: number;
};

function NewInstallmentSalePage() {
  const session = useRequireSession();
  const navigate = useNavigate();
  const [, forceRerender] = useState(0);
  const [customerId, setCustomerId] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedSerialId, setSelectedSerialId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [downPayment, setDownPayment] = useState("0");
  const [planId, setPlanId] = useState("");
  const [customPlan, setCustomPlan] = useState(false);
  const [customDuration, setCustomDuration] = useState("12");
  const [customRate, setCustomRate] = useState("0");
  const [contractDate, setContractDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedPartnerIds, setSelectedPartnerIds] = useState<string[]>([]);
  const [partnerSplits, setPartnerSplits] = useState<Record<string, string>>({});

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: settingsData } = useCurrentTenantSettings(session?.tenant_id);
  const { data: allCustomers = [] } = useCustomers(session?.tenant_id);
  const { data: allProducts = [] } = useProducts(session?.tenant_id);
  const { data: allPlans = [] } = useInstallmentPlans(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const { data: allContracts = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: allInstallments = [] } = useInstallments(session?.tenant_id);
  const { data: allPartners = [] } = usePartners(session?.tenant_id);
  const { data: allPurchases = [] } = usePurchases(session?.tenant_id);
  const createContractMutation = useCreateInstallmentContract(session?.tenant_id);
  const createPlanMutation = useCreateInstallmentPlan(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  const settings = settingsData ?? {
    min_down_payment_pct: 10,
    credit_hold_days: 7,
  };
  const customers = allCustomers.filter((c) => c.status === "active");
  const products = allProducts.filter((p) => p.active);
  const plans = allPlans.filter((p) => p.active);
  const customer = customers.find((c) => c.id === customerId);

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
          unit_price: selectedProduct.installment_price,
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
          unit_price: selectedProduct.installment_price,
        },
      ]);
      setQuantity("1");
    }
    setSelectedProductId("");
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const cashSubtotal = cart.reduce((sum, l) => sum + l.unit_price * l.quantity, 0);
  const downPaymentNum = Number(downPayment) || 0;
  const minDownPayment =
    Math.round(cashSubtotal * (settings.min_down_payment_pct / 100) * 100) / 100;
  const principal = Math.round((cashSubtotal - downPaymentNum) * 100) / 100;
  const plan = customPlan
    ? { duration_months: Number(customDuration) || 0, rate_pct: Number(customRate) || 0 }
    : plans.find((p) => p.id === planId);
  const preview = plan && principal > 0 ? calculateFinance(principal, plan.rate_pct) : null;
  const schedulePreview =
    plan && preview ? generateSchedule(preview.totalAmount, plan.duration_months) : [];

  const exposure = customer
    ? computeCustomerExposure(customer.id, allContracts, allInstallments)
    : 0;
  const availableCredit = customer ? customer.credit_limit - exposure : 0;
  const onCreditHold = customer
    ? computeCustomerOnCreditHold(
        customer.id,
        settings.credit_hold_days,
        allContracts,
        allInstallments,
      )
    : false;

  const cartCost = cart.reduce((sum, l) => {
    const product = allProducts.find((p) => p.id === l.product_id);
    return sum + (product?.cost_price ?? 0) * l.quantity;
  }, 0);
  const distinctProductIds = new Set(cart.map((l) => l.product_id));
  const singleProductId = distinctProductIds.size === 1 ? cart[0]?.product_id : undefined;
  const activePartners = allPartners.filter((p) => p.active);

  function submitContract(finalPlanId: string) {
    createContractMutation.mutate(
      {
        input: {
          customer_id: customerId,
          items: cart.map((l) => ({
            product_id: l.product_id,
            quantity: l.quantity,
            ...(l.serial_id && { serial_id: l.serial_id }),
          })),
          down_payment: downPaymentNum,
          plan_id: finalPlanId,
        },
        actorUserId,
        minDownPaymentPct: settings.min_down_payment_pct,
        creditHoldDays: settings.credit_hold_days,
        ...(contractDate && { createdAt: dateInputToTimestamp(contractDate) }),
      },
      {
        onSuccess: (contract) => {
          if (selectedPartnerIds.length > 0 && session) {
            void settlePartnersForDeal(
              session.tenant_id,
              actorUserId,
              contract.contract_number,
              undefined,
              contract.id,
              selectedPartnerIds.map((partnerId) => {
                const partner = activePartners.find((p) => p.id === partnerId);
                const splitPct = Number(partnerSplits[partnerId]) || 0;
                const preview = computePartnerDealPreview(
                  cashSubtotal,
                  cartCost,
                  splitPct,
                  partner?.profit_share_pct ?? 0,
                );
                return {
                  partnerId,
                  ...(singleProductId ? { productId: singleProductId } : {}),
                  costRecovered: preview.costRecovered,
                  profitAmount: preview.profitAmount,
                };
              }),
            );
          }
          void navigate({ to: "/contracts/$id", params: { id: contract.id } });
        },
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  function handleConfirm() {
    setError(null);
    if (!customerId) {
      setError("اختر عميل — التقسيط لازم يكون على عميل مسجّل");
      return;
    }
    if (customPlan) {
      if (!customDuration || Number(customDuration) <= 0) {
        setError("أدخل مدة التقسيط بالشهور");
        return;
      }
      createPlanMutation.mutate(
        {
          durationMonths: Number(customDuration),
          ratePct: Number(customRate) || 0,
          actorUserId,
          active: false,
        },
        {
          onSuccess: (newPlan) => submitContract(newPlan.id),
          onError: (e) => setError(e instanceof Error ? e.message : "تعذّر إنشاء الخطة المخصصة"),
        },
      );
      return;
    }
    if (!planId) {
      setError("اختر خطة تقسيط");
      return;
    }
    submitContract(planId);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">بيع بالتقسيط جديد</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §35/§37 — لازم عميل مسجّل، والأسعار هنا سعر التقسيط وليس السعر النقدي.
        </p>

        <div className="mt-4">
          <label className="block max-w-sm space-y-1">
            <span className="text-xs font-medium text-foreground">العميل *</span>
            <SearchPicker
              items={customers.map((c) => ({ id: c.id, label: `${c.name} (${c.code})` }))}
              value={customerId}
              onChange={setCustomerId}
              placeholder="بحث باسم العميل..."
            />
          </label>

          {customer && (
            <div className="mt-3 grid max-w-xl grid-cols-3 gap-3">
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">حد الائتمان</p>
                <p className="mt-1 text-sm font-bold text-foreground" dir="ltr">
                  {(customer.credit_limit ?? 0).toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">المتاح الآن</p>
                <p className="mt-1 text-sm font-bold text-foreground" dir="ltr">
                  {availableCredit.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <div className="rounded-lg border border-border bg-card p-3">
                <p className="text-xs text-muted-foreground">حالة الائتمان</p>
                <p
                  className={`mt-1 text-sm font-bold ${onCreditHold ? "text-destructive" : "text-success"}`}
                >
                  {onCreditHold ? "موقوف (Credit Hold)" : "طبيعية"}
                </p>
              </div>
            </div>
          )}
        </div>

        <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">إضافة صنف (سعر التقسيط)</h2>
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
                + أضف للعقد
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
                    العقد فاضي — أضف صنف من فوق.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              المقدّم (الحد الأدنى {minDownPayment.toLocaleString("ar-EG")} ج.م —{" "}
              {settings.min_down_payment_pct}%)
            </span>
            <input
              type="number"
              min="0"
              value={downPayment}
              onChange={(e) => setDownPayment(e.target.value)}
              className="form-input"
              dir="ltr"
            />
          </label>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-foreground">خطة التقسيط *</span>
              <button
                type="button"
                onClick={() => setCustomPlan((v) => !v)}
                className="text-xs font-medium text-primary hover:underline"
              >
                {customPlan ? "استخدام خطة من الإعدادات" : "خطة مخصصة لهذه الصفقة"}
              </button>
            </div>
            {customPlan ? (
              <div className="flex gap-2">
                <input
                  type="number"
                  min="1"
                  placeholder="المدة (شهر)"
                  value={customDuration}
                  onChange={(e) => setCustomDuration(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
                <input
                  type="number"
                  min="0"
                  placeholder="نسبة التمويل %"
                  value={customRate}
                  onChange={(e) => setCustomRate(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
              </div>
            ) : (
              <select
                value={planId}
                onChange={(e) => setPlanId(e.target.value)}
                className="form-input"
              >
                <option value="">اختر خطة</option>
                {plans.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.duration_months} شهر — {p.rate_pct}%
                  </option>
                ))}
              </select>
            )}
          </div>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">
              تاريخ العقد (سيبه فاضي لو دلوقتي)
            </span>
            <input
              type="date"
              value={contractDate}
              onChange={(e) => setContractDate(e.target.value)}
              className="form-input"
              dir="ltr"
            />
          </label>
        </div>

        {preview && plan && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">معاينة الجدول</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Stat label="قيمة البضاعة" value={cashSubtotal} />
              <Stat label="الأصل بعد المقدّم" value={principal} />
              <Stat label="مبلغ التمويل" value={preview.financeAmount} />
              <Stat label="الإجمالي المستحق" value={preview.totalAmount} />
            </div>
            <div className="mt-4 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2 font-medium">القسط</th>
                    <th className="px-4 py-2 font-medium">تاريخ الاستحقاق</th>
                    <th className="px-4 py-2 font-medium">المبلغ</th>
                  </tr>
                </thead>
                <tbody>
                  {schedulePreview.map((line) => (
                    <tr key={line.seq} className="border-b border-border last:border-0">
                      <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                        {line.seq}
                      </td>
                      <td className="px-4 py-2 text-muted-foreground" dir="ltr">
                        {new Date(line.due_date).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-4 py-2 font-medium text-foreground" dir="ltr">
                        {line.amount.toLocaleString("ar-EG")} ج.م
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {cart.length > 0 && activePartners.length > 0 && (
          <PartnerDealPicker
            partners={activePartners}
            purchases={allPurchases}
            selectedIds={selectedPartnerIds}
            onSelectedIdsChange={setSelectedPartnerIds}
            splits={partnerSplits}
            onSplitsChange={setPartnerSplits}
            cashSubtotal={cashSubtotal}
            cost={cartCost}
            {...(singleProductId ? { productId: singleProductId } : {})}
          />
        )}

        <button
          onClick={handleConfirm}
          disabled={
            cart.length === 0 || createContractMutation.isPending || createPlanMutation.isPending
          }
          className="mt-6 rounded-md bg-primary px-6 py-3 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {createContractMutation.isPending || createPlanMutation.isPending
            ? "جارٍ الحفظ..."
            : "تأكيد عقد التقسيط"}
        </button>
      </main>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold text-foreground" dir="ltr">
        {value.toLocaleString("ar-EG")} ج.م
      </p>
    </div>
  );
}
