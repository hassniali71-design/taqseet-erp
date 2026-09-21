import { useState } from "react";

import { computePartnerDealPreview } from "@/lib/supabase-queries";
import { SearchPickerMulti } from "@/components/ui/SearchPicker";
import type { Partner, Purchase } from "@/types";

/** قسم اختياري في شاشة البيع: اختيار الشركاء اللي موّلوا الصفقة دي (ممكن أكتر من واحد)، مع
 * نسبة تقسيم لكل شريك (بالتساوي افتراضيًا، قابلة للتعديل يدويًا)، ومعاينة حية لنصيب كل شريك
 * قبل التأكيد. الحساب نفسه (computePartnerDealPreview) بيفترض إن الربح على هامش البضاعة بس
 * (cashSubtotal - cost)، مش على إيراد التمويل — العميل نفسه أوضح كده. مستخدم في sales.new.tsx
 * و sales.new-installment.tsx بنفس الشكل بالظبط.
 *
 * البائع يقدر يدخل نسبة تقسيمه من الصفقة % (زي ما كان) أو مبلغ ربح فلات مباشرة — الاتنين
 * بيتحوّلوا لنفس splitPct الخارجي (مفيش تغيير في الـcontract الخارجي ولا في sales.new*.tsx)،
 * وبيتعرض تحويل حي للوحدة التانية جنب الإدخال، فيه لو دخل فلوس يشوف بتمثل كام %، ولو دخل
 * نسبة يشوف بتمثل كام جنيه.
 *
 * نسبة ربح الشريك (profit_share_pct) نفسها بقت مفتوحة وقابلة للتعديل وقت إتمام الصفقة —
 * partner.profit_share_pct المخزّنة على ملفه الدائم تُستخدم كقيمة افتراضية بس، مش قفل. لو
 * البائع عدّلها هنا، القيمة المعدَّلة هي اللي بتتسجّل كـSnapshot تاريخي لهذه الصفقة تحديدًا
 * (profit_share_pct_snapshot)، وملف الشريك الدائم مبيتغيرش. */
export function PartnerDealPicker({
  partners,
  purchases,
  selectedIds,
  onSelectedIdsChange,
  splits,
  onSplitsChange,
  profitShares,
  onProfitSharesChange,
  cashSubtotal,
  cost,
  productId,
}: {
  partners: Partner[];
  purchases: Purchase[];
  selectedIds: string[];
  onSelectedIdsChange: (ids: string[]) => void;
  splits: Record<string, string>;
  onSplitsChange: (splits: Record<string, string>) => void;
  /** نسبة ربح كل شريك المعدَّلة لهذه الصفقة بس — مفتاحها partnerId، وتفضل تقرأ من
   * partner.profit_share_pct لو الشريك لسه محدّدش قيمة مخصصة هنا. */
  profitShares: Record<string, string>;
  onProfitSharesChange: (profitShares: Record<string, string>) => void;
  cashSubtotal: number;
  cost: number;
  /** لو الصفقة فيها صنف واحد بس — بيُستخدم لعرض معلومة "آخر مرة اتشرى فيها ده" Best-effort. */
  productId?: string;
}) {
  const [inputModes, setInputModes] = useState<Record<string, "pct" | "amount">>({});
  const [amountInputs, setAmountInputs] = useState<Record<string, string>>({});

  function handleSelectedChange(ids: string[]) {
    onSelectedIdsChange(ids);
    const equalPct = ids.length > 0 ? Math.round((100 / ids.length) * 100) / 100 : 0;
    onSplitsChange(Object.fromEntries(ids.map((id) => [id, String(equalPct)])));
  }

  const margin = cashSubtotal - cost;

  /** بيتحوّل مبلغ ربح مطلوب لنسبة تقسيم الصفقة المكافئة (splitPct) — نفس المعادلة العكسية
   * لـ computePartnerDealPreview لجزء الربح بس: profitAmount = margin * (splitPct/100) *
   * (profitSharePct/100). */
  function amountToSplitPct(amount: number, profitSharePct: number): number {
    const denom = margin * (profitSharePct / 100);
    if (denom <= 0) return 0;
    return Math.round((amount / denom) * 100 * 100) / 100;
  }

  function setPartnerSplitPct(partnerId: string, pct: string) {
    onSplitsChange({ ...splits, [partnerId]: pct });
  }

  function setPartnerProfitSharePct(partnerId: string, pct: string) {
    onProfitSharesChange({ ...profitShares, [partnerId]: pct });
  }

  const lastPurchaseForProduct = productId
    ? [...purchases]
        .filter((p) => p.items.some((i) => i.product_id === productId))
        .sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    : undefined;
  const lastPurchaseItem = lastPurchaseForProduct?.items.find((i) => i.product_id === productId);

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-sm font-bold text-foreground">الشركاء المموّلين لهذه الصفقة (اختياري)</h2>
      {lastPurchaseForProduct && lastPurchaseItem && (
        <p className="mt-1 text-xs text-muted-foreground">
          آخر مرة اتشرى فيها الصنف ده: من {lastPurchaseForProduct.supplier_name} بتاريخ{" "}
          {new Date(lastPurchaseForProduct.created_at).toLocaleDateString("ar-EG")} بسعر{" "}
          {lastPurchaseItem.unit_cost.toLocaleString("ar-EG")} ج.م
        </p>
      )}
      <div className="mt-3">
        <SearchPickerMulti
          items={partners.map((p) => ({ id: p.id, label: p.name }))}
          values={selectedIds}
          onChange={handleSelectedChange}
          placeholder="بحث باسم الشريك..."
        />
      </div>

      {selectedIds.length > 0 && (
        <div className="mt-4 space-y-3">
          {selectedIds.map((partnerId) => {
            const partner = partners.find((p) => p.id === partnerId);
            if (!partner) return null;
            const mode = inputModes[partnerId] ?? "pct";
            const splitPct = Number(splits[partnerId]) || 0;
            const profitSharePct = Number(profitShares[partnerId] ?? partner.profit_share_pct) || 0;
            const preview = computePartnerDealPreview(cashSubtotal, cost, splitPct, profitSharePct);
            return (
              <div key={partnerId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{partner.name}</span>
                  <div className="flex items-center gap-2">
                    <div className="flex overflow-hidden rounded-md border border-input text-xs">
                      <button
                        type="button"
                        onClick={() => setInputModes({ ...inputModes, [partnerId]: "pct" })}
                        className={`px-2 py-1 font-medium ${
                          mode === "pct"
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        نسبة %
                      </button>
                      <button
                        type="button"
                        onClick={() => setInputModes({ ...inputModes, [partnerId]: "amount" })}
                        className={`px-2 py-1 font-medium ${
                          mode === "amount"
                            ? "bg-primary text-primary-foreground"
                            : "text-foreground hover:bg-accent"
                        }`}
                      >
                        مبلغ ربح
                      </button>
                    </div>
                    {mode === "pct" ? (
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">نسبة تقسيمه من الصفقة</span>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={splits[partnerId] ?? ""}
                          onChange={(e) => setPartnerSplitPct(partnerId, e.target.value)}
                          className="form-input w-20"
                          dir="ltr"
                        />
                      </label>
                    ) : (
                      <label className="flex items-center gap-2">
                        <span className="text-xs text-muted-foreground">مبلغ ربحه (ج.م)</span>
                        <input
                          type="number"
                          min="0"
                          value={amountInputs[partnerId] ?? ""}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setAmountInputs({ ...amountInputs, [partnerId]: raw });
                            const amount = Number(raw) || 0;
                            setPartnerSplitPct(
                              partnerId,
                              String(amountToSplitPct(amount, profitSharePct)),
                            );
                          }}
                          className="form-input w-24"
                          dir="ltr"
                        />
                      </label>
                    )}
                  </div>
                </div>
                <p className="mt-2 text-xs text-muted-foreground" dir="rtl">
                  {mode === "pct"
                    ? `بتمثل ${preview.profitAmount.toLocaleString("ar-EG")} ج.م ربح`
                    : `بتمثل ${splitPct.toLocaleString("ar-EG")}% من الصفقة`}
                </p>

                {/* تفصيل الحسبة سطر سطر — عشان البائع يشوف بالظبط منين طلع الرقم النهائي
                    (سعر البيع، تكلفة الشراء، الهامش، نصيبه من الاتنين، ونسبة ربحه من هامشه).
                    نسبة ربحه مفتوحة تتعدّل هنا لهذه الصفقة بس — مش قفل على ملفه الدائم. */}
                <div className="mt-2 grid grid-cols-2 items-center gap-x-3 gap-y-1 rounded-md bg-muted/50 p-2 text-xs">
                  <span className="text-muted-foreground">سعر البيع (الصفقة كلها)</span>
                  <span className="text-left font-medium text-foreground" dir="ltr">
                    {cashSubtotal.toLocaleString("ar-EG")} ج.م
                  </span>
                  <span className="text-muted-foreground">تكلفة الشراء (الصفقة كلها)</span>
                  <span className="text-left font-medium text-foreground" dir="ltr">
                    {cost.toLocaleString("ar-EG")} ج.م
                  </span>
                  <span className="text-muted-foreground">هامش الربح الكلي (بيع − تكلفة)</span>
                  <span className="text-left font-medium text-foreground" dir="ltr">
                    {margin.toLocaleString("ar-EG")} ج.م
                  </span>
                  <span className="text-muted-foreground">نصيبه من الصفقة</span>
                  <span className="text-left font-medium text-foreground" dir="ltr">
                    {splitPct.toLocaleString("ar-EG")}%
                  </span>
                  <span className="text-muted-foreground">نصيبه من التكلفة (اتخصم منه)</span>
                  <span className="text-left font-medium text-foreground" dir="ltr">
                    {preview.costRecovered.toLocaleString("ar-EG")} ج.م
                  </span>
                  <span className="text-muted-foreground">نسبة ربحه من نصيبه في الهامش</span>
                  <span className="text-left" dir="ltr">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={profitShares[partnerId] ?? String(partner.profit_share_pct)}
                      onChange={(e) => setPartnerProfitSharePct(partnerId, e.target.value)}
                      className="form-input w-20 py-1 text-left"
                      dir="ltr"
                    />
                    <span className="mr-1">%</span>
                  </span>
                  <span className="font-bold text-foreground">ربحه النهائي (هيكسب)</span>
                  <span className="text-left font-bold text-success" dir="ltr">
                    {preview.profitAmount.toLocaleString("ar-EG")} ج.م
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  نسبته الدائمة المسجّلة {partner.profit_share_pct}% — النسبة اللي فوق دي مخصوصة
                  بهذه الصفقة بس، متعدّلش ملفه الدائم.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
