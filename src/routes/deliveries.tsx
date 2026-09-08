import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  advanceDeliveryStatus,
  getDeliveryOrders,
  getSales,
  scheduleDelivery,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { DeliveryOrder } from "@/types";

export const Route = createFileRoute("/deliveries")({
  component: DeliveriesPage,
});

const STATUS_LABEL: Record<DeliveryOrder["status"], string> = {
  scheduled: "مجدول",
  out_for_delivery: "في الطريق",
  delivered: "تم التوصيل",
};

const STATUS_CLASS: Record<DeliveryOrder["status"], string> = {
  scheduled: "bg-muted text-muted-foreground",
  out_for_delivery: "bg-warning/15 text-warning",
  delivered: "bg-success/15 text-success",
};

const NEXT_STATUS: Record<DeliveryOrder["status"], DeliveryOrder["status"] | null> = {
  scheduled: "out_for_delivery",
  out_for_delivery: "delivered",
  delivered: null,
};

function DeliveriesPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [saleId, setSaleId] = useState("");
  const [address, setAddress] = useState("");
  const [scheduledDate, setScheduledDate] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const sales = getSales(session.tenant_id);
  const orders = getDeliveryOrders(session.tenant_id).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  function handleSchedule() {
    setError(null);
    if (!saleId) {
      setError("اختر فاتورة");
      return;
    }
    try {
      scheduleDelivery(saleId, address, scheduledDate, actorUserId);
      setSaleId("");
      setAddress("");
      setScheduledDate("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  function handleAdvance(order: DeliveryOrder) {
    const next = NEXT_STATUS[order.status];
    if (!next) return;
    try {
      advanceDeliveryStatus(order.id, next, actorUserId);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">التوصيل</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §84 — خدمة توصيل منفصلة تمامًا عن قيمة البيع أو التقسيط، لا تؤثر على أي منهما.
        </p>

        <div className="mt-6 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">جدولة توصيل جديد</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">الفاتورة *</span>
              <select
                value={saleId}
                onChange={(e) => setSaleId(e.target.value)}
                className="form-input"
              >
                <option value="">اختر فاتورة</option>
                {sales.map((s) => (
                  <option key={s.id} value={s.id}>
                    <span dir="ltr">{s.invoice_number}</span> — {s.customer_name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">العنوان *</span>
              <input
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="form-input"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">تاريخ التوصيل *</span>
              <input
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>
          <button
            onClick={handleSchedule}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            جدولة
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">العميل</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">تاريخ التوصيل</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{order.customer_name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{order.address}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {new Date(order.scheduled_date).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[order.status]}`}
                    >
                      {STATUS_LABEL[order.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-left">
                    {NEXT_STATUS[order.status] && (
                      <button
                        onClick={() => handleAdvance(order)}
                        className="text-xs font-medium text-primary hover:underline"
                      >
                        نقل لـ{STATUS_LABEL[NEXT_STATUS[order.status]!]}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {orders.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد طلبات توصيل بعد.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
