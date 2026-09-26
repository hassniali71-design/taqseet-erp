import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getDaysOverdue,
  getEffectiveInstallmentStatus,
  getEffectivePromiseStatus,
  getReadNotificationIds,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeData,
} from "@/lib/data-store";
import {
  computeProductStock,
  useCurrentTenantSettings,
  useExpenses,
  useInstallmentContracts,
  useInstallments,
  useInventoryMovements,
  useProducts,
  useProductSerials,
  usePromisesToPay,
  usePurchases,
  useSales,
} from "@/lib/supabase-queries";
import { useOwnerPasswordConfirm } from "@/hooks/use-owner-password-confirm";
import { useRequireSession } from "@/hooks/use-session";
import type { AppNotification } from "@/lib/data-store";

export const Route = createFileRoute("/notifications")({
  component: NotificationsPage,
});

const CATEGORY_LABEL: Record<AppNotification["category"], string> = {
  installment_due: "قسط مستحق",
  installment_overdue: "قسط متأخر",
  promise_failed: "وعد دفع فشل",
  low_stock: "مخزون منخفض",
  expense_approval: "مصروف يحتاج اعتماد",
  new_sale: "بيع جديد",
  new_purchase: "أمر شراء جديد",
  new_contract: "عقد تقسيط جديد",
};

/** إشعارات "نشاط حديث" (بيع/شراء/عقد جديد) بتتشال تلقائيًا بعد يومين — أرشيف طويل هنا
 * هيغرق الشاشة، والغرض هنا تنبيه سريع مش سجل دائم (ده دور صفحة `/audit`). */
const RECENT_ACTIVITY_WINDOW_MS = 2 * 24 * 60 * 60 * 1000;
function isRecent(isoDate: string): boolean {
  return Date.now() - new Date(isoDate).getTime() <= RECENT_ACTIVITY_WINDOW_MS;
}

const SEVERITY_CLASS: Record<AppNotification["severity"], string> = {
  info: "border-border bg-card",
  warning: "border-warning/30 bg-warning/5",
  danger: "border-destructive/30 bg-destructive/5",
};

const SEVERITY_BADGE: Record<AppNotification["severity"], string> = {
  info: "bg-muted text-muted-foreground",
  warning: "bg-warning/15 text-warning",
  danger: "bg-destructive/15 text-destructive",
};

function NotificationsPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const { requestConfirm, dialog } = useOwnerPasswordConfirm();

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: settingsData } = useCurrentTenantSettings(session?.tenant_id);
  const { data: contracts = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: allInstallments = [] } = useInstallments(session?.tenant_id);
  const { data: promises = [] } = usePromisesToPay(session?.tenant_id);
  const { data: products = [] } = useProducts(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const { data: expenses = [] } = useExpenses(session?.tenant_id);
  const { data: sales = [] } = useSales(session?.tenant_id);
  const { data: purchases = [] } = usePurchases(session?.tenant_id);

  if (!session) return null;

  const settings = settingsData ?? { grace_period_days: 3 };
  const readIds = new Set(getReadNotificationIds());
  const derived: Array<Omit<AppNotification, "read">> = [];

  const openContracts = contracts.filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
  for (const contract of openContracts) {
    const lines = allInstallments.filter(
      (i) => i.contract_id === contract.id && i.status !== "waived" && i.status !== "rescheduled",
    );
    for (const line of lines) {
      const outstanding = Math.max(0, line.amount - line.paid_amount);
      if (outstanding <= 0) continue;
      const effective = getEffectiveInstallmentStatus(line, settings.grace_period_days);
      if (effective === "due") {
        derived.push({
          id: `inst_due_${line.id}`,
          category: "installment_due",
          message: `قسط مستحق اليوم على عقد ${contract.contract_number} (${contract.customer_name}) بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م`,
          severity: "warning",
        });
      } else if (effective === "overdue") {
        derived.push({
          id: `inst_overdue_${line.id}`,
          category: "installment_overdue",
          message: `قسط متأخر ${getDaysOverdue(line)} يوم على عقد ${contract.contract_number} (${contract.customer_name}) بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م`,
          severity: "danger",
        });
      }
    }
  }

  for (const promise of promises) {
    if (getEffectivePromiseStatus(promise) === "failed") {
      const contract = contracts.find((c) => c.id === promise.contract_id);
      derived.push({
        id: `promise_failed_${promise.id}`,
        category: "promise_failed",
        message: `وعد بالدفع فشل${contract ? ` على عقد ${contract.contract_number} (${contract.customer_name})` : ""} — كان متوقّع بتاريخ ${new Date(promise.promise_date).toLocaleDateString("ar-EG")}`,
        severity: "danger",
      });
    }
  }

  for (const product of products) {
    if (!product.active || product.serial_required) continue;
    const stock = computeProductStock(product.id, false, allSerials, allMovements);
    if (stock < product.min_stock) {
      derived.push({
        id: `low_stock_${product.id}`,
        category: "low_stock",
        message: `مخزون منخفض: "${product.name}" (${stock} فقط، الحد الأدنى ${product.min_stock})`,
        severity: "warning",
      });
    }
  }

  for (const expense of expenses) {
    if (expense.needs_approval) {
      derived.push({
        id: `expense_${expense.id}`,
        category: "expense_approval",
        message: `مصروف يحتاج اعتماد: ${expense.category} بمبلغ ${expense.amount.toLocaleString("ar-EG")} ج.م`,
        severity: "info",
      });
    }
  }

  for (const sale of sales) {
    if (sale.status === "completed" && isRecent(sale.created_at)) {
      derived.push({
        id: `new_sale_${sale.id}`,
        category: "new_sale",
        message: `بيع جديد ${sale.invoice_number} (${sale.customer_name}) بمبلغ ${(sale.total ?? 0).toLocaleString("ar-EG")} ج.م`,
        severity: "info",
      });
    }
  }

  for (const purchase of purchases) {
    if (isRecent(purchase.created_at)) {
      derived.push({
        id: `new_purchase_${purchase.id}`,
        category: "new_purchase",
        message: `أمر شراء جديد ${purchase.purchase_number} من ${purchase.supplier_name} بمبلغ ${(purchase.total ?? 0).toLocaleString("ar-EG")} ج.م`,
        severity: "info",
      });
    }
  }

  for (const contract of contracts) {
    if (isRecent(contract.created_at)) {
      derived.push({
        id: `new_contract_${contract.id}`,
        category: "new_contract",
        message: `عقد تقسيط جديد ${contract.contract_number} (${contract.customer_name}) بإجمالي ${(contract.total_amount ?? 0).toLocaleString("ar-EG")} ج.م`,
        severity: "info",
      });
    }
  }

  const notifications: AppNotification[] = derived.map((n) => ({
    ...n,
    read: readIds.has(n.id),
  }));
  // "حذف" إشعار بيتسجّل كمقروء ويختفي من القائمة فورًا — ده أقرب معنى لـ"حذف" هنا، بما إن
  // الإشعارات نفسها مُشتقة حيًّا وملهاش صف تخزين مستقل (لو نفس الموقف رجع تاني هيظهر كإشعار
  // جديد بمعرّف جديد، مش نفس القديم اللي اتحذف — سلوك متعمَّد، مش باگ).
  const visibleNotifications = notifications.filter((n) => !n.read);

  function handleDeleteOne(id: string) {
    markNotificationRead(id);
  }

  async function handleDeleteAll() {
    if (!window.confirm("حذف كل الإشعارات الحالية؟")) return;
    const confirmed = await requestConfirm();
    if (!confirmed) return;
    markAllNotificationsRead(notifications.map((n) => n.id));
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">الإشعارات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              كل إشعار هنا مُشتق من البيانات وقت العرض، وحالة "مقروء" فعلية لكل إشعار. مفيش أي إرسال
              واتساب/SMS فعلي (Feature Flag متوقف افتراضيًا في الإعدادات).
            </p>
          </div>
          {visibleNotifications.length > 0 && (
            <button
              onClick={() => void handleDeleteAll()}
              className="whitespace-nowrap rounded-md border border-destructive/40 px-3 py-2 text-xs font-medium text-destructive hover:bg-destructive/10"
            >
              حذف الكل ({visibleNotifications.length})
            </button>
          )}
        </div>

        <div className="mt-6 max-h-[36rem] space-y-3 overflow-y-auto">
          {visibleNotifications.map((n) => (
            <div key={n.id} className={`rounded-xl border p-4 ${SEVERITY_CLASS[n.severity]}`}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-primary" />
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[n.severity]}`}
                  >
                    {CATEGORY_LABEL[n.category]}
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteOne(n.id)}
                  className="text-xs font-medium text-destructive hover:underline"
                >
                  حذف
                </button>
              </div>
              <p className="mt-2 text-sm text-foreground">{n.message}</p>
            </div>
          ))}
          {visibleNotifications.length === 0 && (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
              لا يوجد إشعارات حاليًا — كل شيء تحت السيطرة.
            </p>
          )}
        </div>
      </main>
      {dialog}
    </div>
  );
}
