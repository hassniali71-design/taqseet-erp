import { Link, useNavigate, useRouterState } from "@tanstack/react-router";

import { getTenants, getUsers, signOut, type Session } from "@/lib/data-store";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/dashboard", label: "لوحة التحكم" },
  { to: "/customers", label: "العملاء" },
  { to: "/products", label: "الأجهزة" },
  { to: "/sales/new", label: "بيع جديد" },
  { to: "/sales/new-installment", label: "بيع تقسيط" },
  { to: "/stock-count", label: "جرد المخزون" },
  { to: "/users", label: "المستخدمون" },
  { to: "/audit", label: "سجل العمليات" },
  { to: "/settings", label: "الإعدادات" },
] as const;

export function AppHeader({ session }: { session: Session }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = getUsers().find((u) => u.id === session.user_id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex flex-wrap items-center gap-3 sm:gap-6">
          <span className="text-sm font-bold text-foreground">{tenant?.name ?? "تقسيط"}</span>
          <nav className="flex flex-wrap items-center gap-1">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                  pathname === item.to
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">{user?.full_name}</span>
          <button
            onClick={() => {
              signOut();
              void navigate({ to: "/login" });
            }}
            className="rounded-md border border-input bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:bg-accent"
          >
            تسجيل خروج
          </button>
        </div>
      </div>
    </header>
  );
}
