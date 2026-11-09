import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import {
  BarChart3,
  Bell,
  Calculator,
  ClipboardList,
  Handshake,
  History,
  Keyboard,
  LayoutDashboard,
  LogOut,
  MapPin,
  Menu,
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
import { getUsers, signOut, type Session } from "@/lib/data-store";
import { cn } from "@/lib/utils";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { useRealtimeSync } from "@/hooks/use-realtime-sync";
import { InstallAppButton } from "@/components/InstallAppButton";
import { NotificationsBell } from "@/components/NotificationsBell";
import { SoundToggleButton } from "@/components/SoundSettings";
import { forgetPushOnSignOut } from "@/lib/push";
import { Kbd, KeyboardShortcuts, type ShortcutItem } from "@/components/KeyboardShortcuts";
import { HELP_SHORTCUT, assignShortcuts, openShortcutsHelp } from "@/lib/shortcuts";
import { hydrateFromLocal } from "@/lib/table-sync";
import { onOutboxSynced, useOutbox, useOutboxRunner } from "@/lib/outbox";
import { APP_BUILD_TIME, APP_VERSION } from "@/lib/app-version";

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
    label: "الشركاء",
    items: [{ to: "/partners", label: "الشركاء", icon: Handshake }],
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

/** اختصارات الكيبورد بالأهمية (بند 83 — الترتيب اللي وافق عليه المالك): F1 لوحة التحكم، F2 بيع تقسيط،
 * F3 التحصيل… لحد F12، وبعدين Alt+1… (src/lib/shortcuts.ts). الإشعارات من غير اختصار. */
const SHORTCUT_ORDER = [
  "/dashboard",
  "/sales/new-installment",
  "/collections",
  "/sales/new",
  "/customers",
  "/products",
  "/stock-count",
  "/purchases/new",
  "/treasury",
  "/expenses",
  "/deliveries",
  "/reports",
  "/suppliers",
  "/partners",
  "/accounting",
  "/exchanges/new",
  "/warranty",
  "/audit",
  "/users",
  "/settings",
];
const SHORTCUTS = assignShortcuts(SHORTCUT_ORDER);
const SHORTCUT_ITEMS: ShortcutItem[] = NAV_GROUPS.flatMap((g) => g.items)
  .filter((it) => SHORTCUTS.has(it.to))
  .map((it) => ({ url: it.to, title: it.label, key: SHORTCUTS.get(it.to) as string }))
  .sort((a, b) => SHORTCUT_ORDER.indexOf(a.url) - SHORTCUT_ORDER.indexOf(b.url));

export function AppSidebar({ session }: { session: Session }) {
  const navigate = useNavigate();
  // الشريط الجانبي موجود في كل صفحة جوه النظام — مكان واحد يفضل الاشتراك فيه شغال طول الجلسة.
  useRealtimeSync(session.tenant_id);
  // نسخة الجهاز تتعرض فورًا (حتى من غير نت) والمزامنة تكمّل في الخلفية — بند 79.
  const queryClient = useQueryClient();
  useEffect(() => {
    void hydrateFromLocal(queryClient, session.tenant_id);
  }, [queryClient, session.tenant_id]);
  // العمليات اللي اتعملت من غير نت بتتبعت لوحدها، وبعد ما توصل البيانات تتحدّث — بند 80.
  useOutboxRunner(session.tenant_id);
  useEffect(
    () =>
      onOutboxSynced((tenantId) => {
        if (tenantId === session.tenant_id) void queryClient.invalidateQueries();
      }),
    [queryClient, session.tenant_id],
  );
  const outbox = useOutbox(session.tenant_id);
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const user = getUsers().find((u) => u.id === session.user_id);
  // التليفون (بند 81): القايمة كلها بتفتح من "المزيد" وبتتقفل لوحدها مع أي انتقال.
  const [menuOpen, setMenuOpen] = useState(false);
  useEffect(() => setMenuOpen(false), [pathname]);
  // مساحة للشريط اللي فوق واللي تحت على التليفون (styles.css — has-app-chrome).
  useEffect(() => {
    document.body.classList.add("has-app-chrome");
    return () => document.body.classList.remove("has-app-chrome");
  }, []);

  const content = (
    <>
      <div className="border-b border-sidebar-border px-4 py-4">
        <Logo className="text-sidebar-foreground" />
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
                        ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-[0_0_12px_2px_rgba(212,170,23,0.55)]"
                        : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        active && "drop-shadow-[0_0_4px_rgba(255,255,255,0.7)]",
                      )}
                    />
                    {item.label}
                    {SHORTCUTS.has(item.to) && (
                      <Kbd
                        k={SHORTCUTS.get(item.to) as string}
                        className="ms-auto hidden md:inline-flex"
                      />
                    )}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={() => {
            setMenuOpen(false);
            openShortcutsHelp();
          }}
          className="hidden w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-bold text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground md:flex"
        >
          <Keyboard className="h-4 w-4 shrink-0" />
          الاختصارات
          <Kbd k={HELP_SHORTCUT} className="ms-auto" />
        </button>
      </nav>

      <div className="border-t border-sidebar-border px-4 py-3">
        <div className="flex items-center justify-between gap-2">
          <p className="truncate text-xs font-bold text-sidebar-foreground">{user?.full_name}</p>
          <div className="flex shrink-0 items-center">
            <NotificationsBell
              tenantId={session.tenant_id}
              className="h-8 w-8 hover:bg-sidebar-accent"
            />
            <SoundToggleButton className="h-8 w-8 hover:bg-sidebar-accent" />
          </div>
        </div>
        <button
          onClick={async () => {
            if (
              outbox.length > 0 &&
              !window.confirm(
                `فيه ${outbox.length} عملية لسه موصلتش السيرفر. هتفضل محفوظة على الجهاز وهتتبعت أول ما حد من نفس المحل يدخل تاني بالنت. تخرج؟`,
              )
            ) {
              return;
            }
            // التليفون ده مايوصلوش إشعارات الحساب ده تاني (بند 84) — قبل الخروج والجلسة لسه شغالة.
            await forgetPushOnSignOut();
            signOut();
            void navigate({ to: "/login" });
          }}
          className="mt-2 flex w-full items-center justify-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
        >
          <LogOut className="h-3.5 w-3.5" />
          تسجيل خروج
        </button>
        {/* زرار التسطيب موجود دايمًا (بند 81) — حتى جوه البرنامج المتسطّب بيقول "متسطّب بالفعل". */}
        <InstallAppButton className="mt-2" />
        <p className="mt-2 text-center text-[10px] text-sidebar-foreground/60" dir="rtl">
          {APP_VERSION}
          {APP_BUILD_TIME && ` · ${new Date(APP_BUILD_TIME).toLocaleString("ar-EG")}`}
        </p>
      </div>
    </>
  );

  return (
    <>
      <KeyboardShortcuts items={SHORTCUT_ITEMS} />
      {/* الكمبيوتر والتابلت العريض: القايمة الجانبية زي ما هي. */}
      <aside className="hidden w-64 shrink-0 flex-col border-l border-sidebar-border bg-sidebar text-sidebar-foreground md:flex">
        {content}
      </aside>

      {/* التليفون: شريط صغير فوق (لوجو + تسطيب + القايمة). */}
      <header className="no-print safe-top fixed inset-x-0 top-0 z-40 flex h-[calc(3rem+env(safe-area-inset-top))] items-center justify-between gap-2 bg-sidebar px-3 text-sidebar-foreground shadow md:hidden">
        <Logo
          className="gap-1.5 text-sidebar-foreground"
          iconClassName="h-7 w-7"
          showTagline={false}
        />
        <div className="flex items-center gap-1">
          <NotificationsBell tenantId={session.tenant_id} className="hover:bg-white/10" />
          <SoundToggleButton className="hover:bg-white/10" />
          <InstallAppButton compact />
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            aria-label="القايمة"
            className="flex h-9 w-9 items-center justify-center rounded-md hover:bg-white/10"
          >
            <Menu className="h-5 w-5" />
          </button>
        </div>
      </header>

      {/* التليفون: القايمة كلها كدُرج من الجنب. */}
      {menuOpen && (
        <div
          className="no-print fixed inset-0 z-[100] md:hidden"
          onClick={() => setMenuOpen(false)}
        >
          <div className="absolute inset-0 bg-black/50" />
          <aside
            className="safe-top safe-bottom absolute inset-y-0 right-0 flex w-72 max-w-[85vw] flex-col bg-sidebar text-sidebar-foreground shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            {content}
          </aside>
        </div>
      )}

      {/* التليفون: أهم الصفحات تحت الصباع (قرار المالك) + "المزيد". */}
      <nav
        className="no-print safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border bg-card/95 shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur md:hidden"
        aria-label="التنقل السريع"
      >
        <div className="flex items-stretch gap-1 px-2 py-1">
          {MOBILE_TABS.map((t) => {
            const active = pathname === t.to || pathname.startsWith(`${t.to}/`);
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[0.72rem] font-bold transition-colors",
                  active ? "bg-primary/15 text-foreground" : "text-muted-foreground",
                )}
              >
                <Icon className="h-[1.35rem] w-[1.35rem]" />
                <span className="truncate">{t.label}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenuOpen(true)}
            className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 rounded-lg py-1.5 text-[0.72rem] font-bold text-muted-foreground"
          >
            <Menu className="h-[1.35rem] w-[1.35rem]" />
            <span>المزيد</span>
          </button>
        </div>
      </nav>
    </>
  );
}

const MOBILE_TABS: NavItem[] = [
  { to: "/dashboard", label: "الرئيسية", icon: LayoutDashboard },
  { to: "/collections", label: "التحصيل", icon: Wallet },
  { to: "/sales/new-installment", label: "بيع تقسيط", icon: Percent },
  { to: "/customers", label: "العملاء", icon: Users },
];
