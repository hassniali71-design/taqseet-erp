import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { getAuditLogs, getUsers, subscribeData } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/audit")({
  component: AuditPage,
});

const ACTION_LABELS: Record<string, string> = {
  "tenant.create": "إنشاء محل",
  "tenant.status_change": "تغيير حالة اشتراك",
  "tenant_settings.update": "تعديل الإعدادات",
  "user.create": "إنشاء مستخدم",
  "user.status_change": "تغيير حالة مستخدم",
  "user_role.assign": "إسناد دور",
  "user_role.set": "تغيير دور",
  "customer.create": "إنشاء عميل",
  "customer.update": "تعديل عميل",
  "product.create": "إنشاء جهاز",
  "product.update": "تعديل جهاز",
};

function AuditPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

  const users = getUsers(session.tenant_id);
  const logs = [...getAuditLogs(session.tenant_id)].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );

  function userName(userId: string | null): string {
    if (!userId) return "النظام";
    return users.find((u) => u.id === userId)?.full_name ?? userId;
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">سجل العمليات (Audit Log)</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          سجل غير قابل للتعديل أو الحذف — كل عملية حساسة في النظام تُسجَّل هنا تلقائيًا (§12).
        </p>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الوقت</th>
                <th className="px-4 py-3 font-medium">العملية</th>
                <th className="px-4 py-3 font-medium">الكيان</th>
                <th className="px-4 py-3 font-medium">بواسطة</th>
                <th className="px-4 py-3 font-medium">السبب</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((log) => (
                <tr key={log.id} className="border-b border-border last:border-0">
                  <td
                    className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground"
                    dir="ltr"
                  >
                    {new Date(log.created_at).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    {ACTION_LABELS[log.action] ?? log.action}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {log.entity}
                    {log.entity_id ? ` / ${log.entity_id}` : ""}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{userName(log.user_id)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{log.reason ?? "—"}</td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    لا توجد عمليات مسجّلة بعد.
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
