import { useEffect, useState } from "react";

import { getSession } from "@/lib/data-store";
import { applyUpdate, useOnline, useUpdateAvailable } from "@/lib/pwa";
import { lastLocalSave } from "@/lib/table-sync";

/** شريط صغير تحت الشاشة (بند 79):
 *   • من غير نت: بيقول إن المعروض هو آخر نسخة اتحفظت على الجهاز، ووقتها.
 *   • نسخة جديدة من البرنامج نزلت: زرار "تحديث" — المستخدم هو اللي يدوس، مش إعادة تحميل غصب عنه. */
export function AppStatusBar() {
  const online = useOnline();
  const updateReady = useUpdateAvailable();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (online) return;
    const tenantId = getSession()?.tenant_id;
    if (tenantId) void lastLocalSave(tenantId).then(setSavedAt);
  }, [online]);

  if (online && !updateReady) return null;

  return (
    <div className="no-print fixed inset-x-0 bottom-0 z-[90] flex flex-col items-center gap-2 p-3">
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
