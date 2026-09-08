import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  subscribeData,
} from "@/lib/data-store";
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
};

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

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const notifications = getNotifications();
  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-3xl px-4 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">الإشعارات</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              §92 — كل إشعار هنا مُشتق من البيانات وقت العرض، وحالة "مقروء" فعلية لكل إشعار. مفيش أي
              إرسال واتساب/SMS فعلي (§93 — Feature Flag متوقف افتراضيًا في الإعدادات).
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={() => markAllNotificationsRead(notifications.map((n) => n.id))}
              className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-bold text-foreground hover:bg-accent"
            >
              تعليم الكل كمقروء ({unreadCount})
            </button>
          )}
        </div>

        <div className="mt-6 space-y-3">
          {notifications.map((n) => (
            <div
              key={n.id}
              className={`rounded-xl border p-4 ${SEVERITY_CLASS[n.severity]} ${n.read ? "opacity-60" : ""}`}
            >
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  {!n.read && <span className="h-2 w-2 rounded-full bg-primary" />}
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${SEVERITY_BADGE[n.severity]}`}
                  >
                    {CATEGORY_LABEL[n.category]}
                  </span>
                </div>
                {!n.read && (
                  <button
                    onClick={() => markNotificationRead(n.id)}
                    className="text-xs font-bold text-primary hover:underline"
                  >
                    تعليم كمقروء
                  </button>
                )}
              </div>
              <p className="mt-2 text-sm text-foreground">{n.message}</p>
            </div>
          ))}
          {notifications.length === 0 && (
            <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
              لا يوجد إشعارات حاليًا — كل شيء تحت السيطرة.
            </p>
          )}
        </div>
      </main>
    </div>
  );
}
