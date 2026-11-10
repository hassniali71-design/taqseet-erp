/** بند 91 — «نص دلوقتي والباقي في ميعاد» (مفتاح deferred_cash_enabled). في البيع الكاش: لو المدفوع
 * أقل من الإجمالي، الباقي يا إما يتقسّط (شاشة التقسيط بالمقدّم ده)، يا إما يتدفع في يوم معيّن (عقد
 * بقسط واحد 0% — التحصيل والتأخير والتقارير شغالين لوحدهم من محرك التقسيط من غير ما يتلمس). */
import { useState } from "react";

import { DateInput } from "@/components/ui/DateInput";

export function DeferredPaymentPanel({
  total,
  paidNow,
  onPaidNowChange,
  hasCustomer,
  hasDiscount,
  saving,
  onInstallRest,
  onPayOnDate,
}: {
  total: number;
  paidNow: string;
  onPaidNowChange: (v: string) => void;
  hasCustomer: boolean;
  hasDiscount: boolean;
  saving: boolean;
  onInstallRest: () => void;
  onPayOnDate: (date: string) => void;
}) {
  const [dueDate, setDueDate] = useState("");
  const paid = paidNow.trim() === "" ? total : Number(paidNow);
  const rest = Math.round((total - paid) * 100) / 100;
  const partial = paidNow.trim() !== "" && paid >= 0 && rest > 0;
  const today = new Date().toISOString().slice(0, 10);

  return (
    <div className="mt-4 space-y-3 rounded-xl border border-border bg-card p-4">
      <label className="block max-w-xs space-y-1">
        <span className="text-xs font-bold text-foreground">المدفوع دلوقتي</span>
        <input
          type="number"
          min="0"
          value={paidNow}
          onChange={(e) => onPaidNowChange(e.target.value)}
          placeholder={`${total.toLocaleString("ar-EG")} (كله)`}
          className="form-input"
          dir="ltr"
        />
      </label>
      {paidNow.trim() !== "" && paid > total && (
        <p className="text-sm text-destructive">المدفوع أكبر من الإجمالي</p>
      )}
      {partial && (
        <div className="space-y-3 rounded-lg border-2 border-primary/50 bg-primary/5 p-3">
          <p className="text-sm font-bold text-foreground">
            الباقي: {rest.toLocaleString("ar-EG")} ج.م — يدفعه إزاي؟
          </p>
          {!hasCustomer && (
            <p className="text-sm font-bold text-warning">
              اختار العميل الأول — الباقي لازم يتسجّل على اسم عميل.
            </p>
          )}
          {hasDiscount && (
            <p className="text-sm font-bold text-warning">
              الخصم مش بيتطبّق مع الباقي — شيله وعدّل السعر نفسه.
            </p>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">📅 الباقي يدفعه يوم</span>
              <DateInput value={dueDate} onChange={setDueDate} />
            </label>
            <button
              type="button"
              disabled={!hasCustomer || hasDiscount || saving || !dueDate || dueDate <= today}
              onClick={() => onPayOnDate(dueDate)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? "جارٍ الحفظ..." : "سجّل والباقي في الميعاد"}
            </button>
            <span className="text-xs text-muted-foreground">أو</span>
            <button
              type="button"
              disabled={!hasCustomer || hasDiscount || saving}
              onClick={onInstallRest}
              className="rounded-md border border-primary/60 px-4 py-2 text-sm font-bold text-foreground hover:bg-primary/10 disabled:cursor-not-allowed disabled:opacity-50"
            >
              قسّط الباقي ←
            </button>
          </div>
          {dueDate && dueDate <= today && (
            <p className="text-xs text-destructive">الميعاد لازم يبقى بعد النهارده</p>
          )}
        </div>
      )}
    </div>
  );
}
