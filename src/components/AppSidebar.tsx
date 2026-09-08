import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Calculator,
  ClipboardList,
  History,
  LayoutDashboard,
  LogOut,
  MapPin,
  Package,
  PackagePlus,
  Percent,
  Receipt,
  Repeat,
  Settings,
  ShieldCheck,
  ShoppingCart,
  Truck,
  UserCog,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";

import { Logo } from "@/components/Logo";
import { getTenants, getUsers, signOut, type Session } from "@/lib/data-store";
import { cn } from "@/lib/utils";

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
}

const NAV_GROUPS: NavGroup[] = [
  {
    label: "الرئيسية",
    items: [
      { to: "/dashboard", label: "لوحة التحكم", icon: LayoutDashboard },
      { to: "/reports", label: "التقارير", icon: BarChart3 },
      { to: "/notifications", label: "الإشعارات", icon: Bell },
    ],
  },
  {
    label: "المبيعات والعملاء",
    items: [
      { to: "/customers", label: "العملاء", icon: Users },
      { to: "/sales/new", label: "بيع جديد", icon: ShoppingCart },
    ],
  },
  {
    label: "التقسيط والتحصيل",
    items: [
      { to: "/sales/new-installment", label: "بيع تقسيط", icon: Percent },
      { to: "/collections", label: "التحصيل", icon: Wallet },
    ],
  },
  {
    label: "المخزون",
    items: [
      { to: "/products", label: "الأجهزة", icon: Package },
      { to: "/stock-count", label: "جرد المخزون", icon: ClipboardList },
    ],
  },
  {
    label: "المشتريات والموردون",
    items: [
      { to: "/suppliers", label: "الموردون", icon: Truck },
      { to: "/purchases/new", label: "شراء جديد", icon: PackagePlus },
    ],
  },
  {
    label: "المالية",
    items: [
      { to: "/treasury", label: "الخزينة", icon: Wallet },
      { to: "/expenses", label: "المصروفات", icon: Receipt },
      { to: "/accounting", label: "المحاسبة", icon: Calculator },
    ],
  },
  {
    label: "ما بعد البيع",
    items: [
      { to: "/exchanges/new", label: "استبدال", icon: Repeat },
      { to: "/deliveries", label: "التوصيل", icon: MapPin },
      { to: "/warranty", label: "الضمان", icon: ShieldCheck },
    ],
  },
  {
    label: "الإدارة",
    items: [
      { to: "/users", label: "المستخدمون", icon: UserCog },
      { to: "/audit", label: "سجل العمليات", icon: History },
      { to: "/settings", label: "الإعدادات", icon: Settings },
    ],
  },
];

export function AppSidebar({ session }: { session: Session }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = getUsers().find((u) => u.id === session.user_id);
  const tenant = getTenants().find((t) => t.id === session.tenant_id);

  return (
    <aside className="flex w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground">
      <div className="border-b border-sidebar-border px-4 py-4">
        <Logo className="text-sidebar-foreground" />
        <p className="mt-2 truncate text-xs font-bold text-sidebar-foreground/70">
          {tenant?.name ?? "تقسيط"}
        </p>
      </div>

      <nav className="flex-1 space-y-4 overflow-y-auto px-3 py-4">
        {NAV_GROUPS.map((group) => (
          <div key={group.label}>
            <p className="px-2 pb-1.5 text-[11px] font-extrabold tracking-wide text-sidebar-foreground/50">
              {group.label}
            </p>
            <div className="space-y-0.5">
              {group.items.map((item) => {
                const Icon = item.icon;
                const active = pathname === item.to || pathname.startsWith(`${item.to}/`);
                return (
                  <Link
                    key={item.to}
                    to={item.to}
                    className={cn(
                      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-bold transition-colors",
                      active
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0" />
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <p className="truncate text-xs font-bold text-sidebar-foreground">{user?.full_name}</p>
        <button
          onClick={() => {
            signOut();
            void navigate({ to: "/login" });
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="h-3.5 w-3.5" />
          تسجيل خروج
        </button>
      </div>
    </aside>
  );
}
