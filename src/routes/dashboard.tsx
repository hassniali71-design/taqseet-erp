import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import {
  getSession,
  getTenants,
  getUsers,
  signOut,
  subscribeData,
  type Session,
} from "@/lib/data-store";

export const Route = createFileRoute("/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const navigate = useNavigate();
  // Starts undefined on both server and client render so the first paint matches exactly
  // (getSession() reads localStorage, which only exists client-side — reading it directly
  // during render would desync SSR/CSR output and trigger a hydration mismatch).
  const [session, setSession] = useState<Session | null | undefined>(undefined);

  useEffect(() => {
    setSession(getSession());
    return subscribeData(() => setSession(getSession()));
  }, []);

  useEffect(() => {
    if (session === null) void navigate({ to: "/login" });
  }, [session, navigate]);

  if (!session) return null;

  const user = getUsers().find((u) => u.id === session.user_id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background px-4 text-center">
      <h1 className="text-2xl font-bold text-foreground">لوحة التحكم (Placeholder)</h1>
      <p className="text-sm text-muted-foreground">
        مسجّل دخول باسم <span className="font-medium text-foreground">{user?.full_name}</span> —
        المحل: <span className="font-medium text-foreground">{tenant?.name}</span>
      </p>
      <p className="max-w-md text-xs text-muted-foreground">
        هذه صفحة Placeholder فقط للتأكد من تدفق الدخول الوهمي (Mock). الشاشات الحقيقية للوحة التحكم
        تُبنى في المراحل القادمة (Phase 1 وما بعدها).
      </p>
      <button
        onClick={() => {
          signOut();
          void navigate({ to: "/login" });
        }}
        className="rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
      >
        تسجيل خروج
      </button>
    </div>
  );
}
