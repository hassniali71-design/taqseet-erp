import { useEffect, useState } from "react";

import { getSession } from "@/lib/data-store";
import { outboxRemove, useOutbox, type OutboxEntry } from "@/lib/outbox";
import { applyUpdate, useOnline, useUpdateAvailable } from "@/lib/pwa";
import { lastLocalSave } from "@/lib/table-sync";

/** شريط صغير تحت الشاشة (بند 79 + 80):
 *   • من غير نت: بيقول إن المعروض هو آخر نسخة اتحفظت على الجهاز، ووقتها.
 *   • عمليات مستنية النت (تحصيل/عقود مؤقتة): عددها، وتفاصيلها بضغطة.
 *   • عملية اترفضت لما وصلت (السيريال اتباع، المبلغ أكبر من المتبقي...): بالسبب، وزرار إلغاء.
 *   • نسخة جديدة من البرنامج نزلت: زرار "تحديث" — المستخدم هو اللي يدوس، مش إعادة تحميل غصب عنه. */
export function AppStatusBar() {
  const online = useOnline();
  const updateReady = useUpdateAvailable();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [tenantId, setTenantId] = useState<string | undefined>(undefined);
  const [showDetails, setShowDetails] = useState(false);
  const outbox = useOutbox(tenantId);

  useEffect(() => {
    const update = () => setTenantId(getSession()?.tenant_id);
    update();
    const timer = window.setInterval(update, 5_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (online || !tenantId) return;
    void lastLocalSave(tenantId).then(setSavedAt);
  }, [online, tenantId]);

  const waiting = outbox.filter((e) => e.status !== "rejected");
  const rejected = outbox.filter((e) => e.status === "rejected");
  const waitingUpdate = waiting.some((e) => e.status === "waiting_update");

  if (online && !updateReady && outbox.length === 0) return null;

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-3">
      {rejected.map((e) => (
        <div
          key={e.id}
          className="w-full max-w-xl rounded-lg bg-destructive px-4 py-3 text-sm text-destructive-foreground shadow-lg"
        >
          <p className="font-bold">{describe(e)} — اترفضت لما وصلت السيرفر ومتسجّلتش:</p>
          <p className="mt-1">{e.error}</p>
          <p className="mt-1 text-xs opacity-90">
            العمليات اللي بعدها مستنياها. الغيها واعملها تاني صح (لو لسه مطلوبة).
          </p>
          <button
            onClick={() => {
              if (tenantId && window.confirm(`إلغاء العملية دي نهائيًا؟\n${describe(e)}`)) {
                void outboxRemove(tenantId, e.id);
              }
            }}
            className="mt-2 rounded-md bg-white px-3 py-1 text-xs font-bold text-destructive hover:opacity-90"
          >
            إلغاء العملية دي
          </button>
        </div>
      ))}
      {waiting.length > 0 && (
        <div className="w-full max-w-xl rounded-lg bg-warning px-4 py-2 text-sm text-warning-foreground shadow-lg">
          <button
            onClick={() => setShowDetails((v) => !v)}
            className="w-full text-center font-bold"
          >
            فيه {waiting.length} عملية مستنية {waitingUpdate ? "تحديث قاعدة البيانات" : "النت"} —
            محفوظة على الجهاز ومش هتضيع
            {showDetails ? " ▲" : " ▼"}
          </button>
          {showDetails && (
            <ul className="mt-2 space-y-1 text-xs">
              {waiting.map((e) => (
                <li key={e.id}>
                  • {describe(e)} — {new Date(e.at).toLocaleString("ar-EG")}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {!online && (
        <div className="rounded-lg bg-[#1B2A41] px-4 py-2 text-center text-sm font-bold text-white shadow-lg">
          إنت من غير نت — بتشوف آخر بيانات اتحفظت على الجهاز
          {savedAt && ` (آخر تحديث ${new Date(savedAt).toLocaleString("ar-EG")})`}. أول ما النت يرجع
          هتتحدّث لوحدها.
        </div>
      )}
      {updateReady && (
        <div className="flex items-center gap-3 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground shadow-lg">
          فيه تحديث جديد للبرنامج
          <button
            onClick={applyUpdate}
            className="rounded-md bg-[#1B2A41] px-3 py-1 text-xs font-bold text-white hover:opacity-90"
          >
            اضغط للتحديث
          </button>
        </div>
      )}
    </div>
  );
}

function describe(e: OutboxEntry): string {
  if (e.kind === "collect") {
    return `تحصيل ${e.amount.toLocaleString("ar-EG")} ج.م${e.contractNumber ? ` لعقد ${e.contractNumber}` : ""}${e.customerName ? ` (${e.customerName})` : ""}`;
  }
  return `عقد مؤقت لـ${e.customerName} — إجمالي ${e.totalAmount.toLocaleString("ar-EG")} ج.م`;
}
