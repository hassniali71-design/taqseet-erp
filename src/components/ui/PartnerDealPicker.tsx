import { computePartnerDealPreview } from "@/lib/supabase-queries";
import { SearchPickerMulti } from "@/components/ui/SearchPicker";
import type { Partner, Purchase } from "@/types";

/** قسم اختياري في شاشة البيع: اختيار الشركاء اللي موّلوا الصفقة دي (ممكن أكتر من واحد)، مع
 * نسبة تقسيم لكل شريك (بالتساوي افتراضيًا، قابلة للتعديل يدويًا)، ومعاينة حية لنصيب كل شريك
 * قبل التأكيد. الحساب نفسه (computePartnerDealPreview) بيفترض إن الربح على هامش البضاعة بس
 * (cashSubtotal - cost)، مش على إيراد التمويل — العميل نفسه أوضح كده. مستخدم في sales.new.tsx
 * و sales.new-installment.tsx بنفس الشكل بالظبط. */
export function PartnerDealPicker({
  partners,
  purchases,
  selectedIds,
  onSelectedIdsChange,
  splits,
  onSplitsChange,
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
  cashSubtotal: number;
  cost: number;
  /** لو الصفقة فيها صنف واحد بس — بيُستخدم لعرض معلومة "آخر مرة اتشرى فيها ده" Best-effort. */
  productId?: string;
}) {
  function handleSelectedChange(ids: string[]) {
    onSelectedIdsChange(ids);
    const equalPct = ids.length > 0 ? Math.round((100 / ids.length) * 100) / 100 : 0;
    onSplitsChange(Object.fromEntries(ids.map((id) => [id, String(equalPct)])));
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
            const splitPct = Number(splits[partnerId]) || 0;
            const preview = computePartnerDealPreview(
              cashSubtotal,
              cost,
              splitPct,
              partner.profit_share_pct,
            );
            return (
              <div key={partnerId} className="rounded-lg border border-border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-sm font-bold text-foreground">{partner.name}</span>
                  <label className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">نسبة تقسيمه من الصفقة %</span>
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={splits[partnerId] ?? ""}
                      onChange={(e) => onSplitsChange({ ...splits, [partnerId]: e.target.value })}
                      className="form-input w-20"
                      dir="ltr"
                    />
                  </label>
                </div>
                <p className="mt-2 text-sm text-muted-foreground" dir="rtl">
                  اتباعت بـ{cashSubtotal.toLocaleString("ar-EG")} ج.م، وهترجع لك{" "}
                  <span className="font-bold text-foreground">
                    {preview.costRecovered.toLocaleString("ar-EG")} ج.م
                  </span>{" "}
                  من رأس مالك، وهتكسب{" "}
                  <span className="font-bold text-success">
                    {preview.profitAmount.toLocaleString("ar-EG")} ج.م
                  </span>{" "}
                  يا {partner.name}.
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
