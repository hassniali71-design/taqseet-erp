import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  Building2,
  CheckCircle2,
  Copy,
  LogOut,
  Pause,
  Play,
  Plus,
  RefreshCw,
  ShieldAlert,
  Users,
} from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Logo } from "@/components/Logo";
import { Panel } from "@/components/ui/StatCard";
import { useSession } from "@/hooks/use-session";
import {
  extendTenantSubscription,
  getManagedTenants,
  getUsers,
  provisionTenant,
  setTenantStatus,
  signOut,
  subscribeData,
  type ProvisionTenantResult,
} from "@/lib/data-store";
import type { TenantStatus } from "@/types";

export const Route = createFileRoute("/platform")({
  component: PlatformControlRoom,
});

const STATUS_LABEL: Record<TenantStatus, string> = {
  trial: "تجريبي",
  active: "نشط",
  expired: "منتهي",
  suspended: "موقوف",
};

const STATUS_TONE: Record<TenantStatus, "success" | "primary" | "warning" | "danger"> = {
  trial: "primary",
  active: "success",
  expired: "warning",
  suspended: "danger",
};

function daysLeft(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function PlatformControlRoom() {
  const session = useSession();
  const navigate = useNavigate();
  const [, forceRerender] = useState(0);
  const [showCreate, setShowCreate] = useState(false);
  const [justCreated, setJustCreated] = useState<ProvisionTenantResult | null>(null);
  const [form, setForm] = useState({ name: "", owner_name: "", phone: "", owner_email: "" });

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const currentUser = session ? getUsers().find((u) => u.id === session.user_id) : undefined;

  useEffect(() => {
    if (session === null) {
      void navigate({ to: "/platform/login" });
      return;
    }
    if (session && currentUser && !currentUser.is_platform_owner) {
      void navigate({ to: "/login" });
    }
  }, [session, currentUser, navigate]);

  if (!session || !currentUser?.is_platform_owner) return null;

  const tenants = getManagedTenants();
  const totalCustomers = tenants.length;
  const activeCount = tenants.filter((t) => t.status === "active" || t.status === "trial").length;
  const expiringCount = tenants.filter(
    (t) => t.status !== "suspended" && daysLeft(t.subscription_end) <= 7,
  ).length;
  const suspendedCount = tenants.filter((t) => t.status === "suspended").length;

  function handleCreate(event: FormEvent) {
    event.preventDefault();
    const result = provisionTenant(form, session?.user_id ?? null);
    setJustCreated(result);
    setForm({ name: "", owner_name: "", phone: "", owner_email: "" });
    setShowCreate(false);
    toast.success(`تم إنشاء عميل جديد: ${result.tenant.name}`);
  }

  function copyCredentials(result: ProvisionTenantResult) {
    const text = `البريد: ${result.ownerEmail}\nكلمة السر: ${result.ownerPassword}`;
    void navigator.clipboard.writeText(text);
    toast.success("تم نسخ بيانات الدخول");
  }

  return (
    <div className="min-h-screen bg-sidebar">
      <header className="border-b border-sidebar-border px-6 py-4">
        <div className="mx-auto flex max-w-6xl items-center justify-between">
          <Logo className="text-sidebar-foreground" />
          <div className="flex items-center gap-4">
            <p className="text-sm font-bold text-sidebar-foreground/80">{currentUser.full_name}</p>
            <button
              onClick={() => {
                signOut();
                void navigate({ to: "/platform/login" });
              }}
              className="flex items-center gap-1.5 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-3 py-1.5 text-xs font-bold text-sidebar-foreground transition-colors hover:bg-sidebar-accent"
            >
              <LogOut className="h-3.5 w-3.5" />
              تسجيل خروج
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl text-sidebar-foreground">غرفة تحكم المنصة</h1>
            <p className="mt-1 text-sm font-bold text-sidebar-foreground/70">
              إدارة كل عملاء (محلات) منصة حسبة من مكان واحد
            </p>
          </div>
          <button
            onClick={() => setShowCreate((v) => !v)}
            className="flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Plus className="h-4 w-4" />
            عميل جديد
          </button>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-sidebar-foreground/60">إجمالي العملاء</p>
              <Building2 className="h-4 w-4 text-primary" />
            </div>
            <p className="font-stat mt-2 text-2xl font-extrabold text-sidebar-foreground">
              {totalCustomers}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-sidebar-foreground/60">نشط الآن</p>
              <CheckCircle2 className="h-4 w-4 text-success" />
            </div>
            <p className="font-stat mt-2 text-2xl font-extrabold text-sidebar-foreground">
              {activeCount}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-sidebar-foreground/60">
                قرب الانتهاء (٧ أيام)
              </p>
              <ShieldAlert className="h-4 w-4 text-warning" />
            </div>
            <p className="font-stat mt-2 text-2xl font-extrabold text-sidebar-foreground">
              {expiringCount}
            </p>
          </div>
          <div className="rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/30 p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-extrabold text-sidebar-foreground/60">موقوف</p>
              <Users className="h-4 w-4 text-destructive" />
            </div>
            <p className="font-stat mt-2 text-2xl font-extrabold text-sidebar-foreground">
              {suspendedCount}
            </p>
          </div>
        </div>

        {justCreated && (
          <div className="mt-6 rounded-2xl border-2 border-primary/60 bg-primary/10 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-extrabold text-sidebar-foreground">
                بيانات دخول العميل الجديد — تُعرض مرة واحدة فقط، احفظها الآن
              </h2>
              <button
                onClick={() => copyCredentials(justCreated)}
                className="flex items-center gap-1.5 rounded-md border border-primary/50 px-2.5 py-1 text-xs font-bold text-sidebar-foreground hover:bg-primary/10"
              >
                <Copy className="h-3.5 w-3.5" />
                نسخ
              </button>
            </div>
            <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2" dir="ltr">
              <div className="rounded-md border border-sidebar-border bg-sidebar/60 px-3 py-2 text-sm font-bold text-sidebar-foreground">
                {justCreated.ownerEmail}
              </div>
              <div className="rounded-md border border-sidebar-border bg-sidebar/60 px-3 py-2 text-sm font-bold text-sidebar-foreground">
                {justCreated.ownerPassword}
              </div>
            </div>
            <button
              onClick={() => setJustCreated(null)}
              className="mt-3 text-xs font-bold text-sidebar-foreground/60 hover:underline"
            >
              إخفاء
            </button>
          </div>
        )}

        {showCreate && (
          <div className="mt-6 rounded-2xl border-2 border-sidebar-border bg-sidebar-accent/20 p-5">
            <h2 className="text-sm font-extrabold text-sidebar-foreground">إنشاء عميل جديد</h2>
            <form onSubmit={handleCreate} className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field
                label="اسم المحل"
                value={form.name}
                onChange={(v) => setForm({ ...form, name: v })}
              />
              <Field
                label="اسم المالك"
                value={form.owner_name}
                onChange={(v) => setForm({ ...form, owner_name: v })}
              />
              <Field
                label="رقم الهاتف"
                value={form.phone}
                onChange={(v) => setForm({ ...form, phone: v })}
                dir="ltr"
              />
              <Field
                label="بريد المالك الإلكتروني"
                value={form.owner_email}
                onChange={(v) => setForm({ ...form, owner_email: v })}
                type="email"
                dir="ltr"
              />
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground transition-colors hover:bg-primary/90"
                >
                  إنشاء العميل وتوليد بيانات الدخول
                </button>
              </div>
            </form>
          </div>
        )}

        <div className="mt-6">
          <Panel
            title="العملاء"
            description="كل محل مشترك في المنصة — تفعيل/تعليق/تجديد الاشتراك"
            className="border-sidebar-border bg-sidebar-accent/20 [&_h2]:text-sidebar-foreground [&_p]:text-sidebar-foreground/70"
          >
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-sidebar-border text-right text-sidebar-foreground/60">
                    <th className="pb-2 font-extrabold">المحل</th>
                    <th className="pb-2 font-extrabold">المالك</th>
                    <th className="pb-2 font-extrabold">الهاتف</th>
                    <th className="pb-2 font-extrabold">الحالة</th>
                    <th className="pb-2 font-extrabold">الاشتراك ينتهي</th>
                    <th className="pb-2 font-extrabold">إجراءات</th>
                  </tr>
                </thead>
                <tbody>
                  {tenants.map((tenant) => (
                    <tr key={tenant.id} className="border-b border-sidebar-border/60">
                      <td className="py-3 font-bold text-sidebar-foreground">{tenant.name}</td>
                      <td className="py-3 font-bold text-sidebar-foreground/80">
                        {tenant.owner_name}
                      </td>
                      <td className="py-3 font-bold text-sidebar-foreground/80" dir="ltr">
                        {tenant.phone}
                      </td>
                      <td className="py-3">
                        <span
                          className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                            STATUS_TONE[tenant.status] === "success"
                              ? "bg-success/20 text-success"
                              : STATUS_TONE[tenant.status] === "danger"
                                ? "bg-destructive/20 text-destructive"
                                : STATUS_TONE[tenant.status] === "warning"
                                  ? "bg-warning/20 text-warning"
                                  : "bg-primary/20 text-primary"
                          }`}
                        >
                          {STATUS_LABEL[tenant.status]}
                        </span>
                      </td>
                      <td className="py-3 font-bold text-sidebar-foreground/80" dir="ltr">
                        {new Date(tenant.subscription_end).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap gap-2">
                          {tenant.status === "suspended" ? (
                            <button
                              onClick={() => {
                                setTenantStatus(
                                  tenant.id,
                                  "active",
                                  session?.user_id ?? null,
                                  "إعادة تفعيل من غرفة تحكم المنصة",
                                );
                                toast.success("تم تفعيل المحل");
                              }}
                              className="flex items-center gap-1 rounded-md border border-success/40 px-2 py-1 text-xs font-bold text-success hover:bg-success/10"
                            >
                              <Play className="h-3 w-3" />
                              تفعيل
                            </button>
                          ) : (
                            <button
                              onClick={() => {
                                setTenantStatus(
                                  tenant.id,
                                  "suspended",
                                  session?.user_id ?? null,
                                  "تعليق من غرفة تحكم المنصة",
                                );
                                toast.success("تم تعليق المحل");
                              }}
                              className="flex items-center gap-1 rounded-md border border-destructive/40 px-2 py-1 text-xs font-bold text-destructive hover:bg-destructive/10"
                            >
                              <Pause className="h-3 w-3" />
                              تعليق
                            </button>
                          )}
                          <button
                            onClick={() => {
                              extendTenantSubscription(tenant.id, 30, session?.user_id ?? null);
                              toast.success("تم تمديد الاشتراك ٣٠ يوم");
                            }}
                            className="flex items-center gap-1 rounded-md border border-primary/40 px-2 py-1 text-xs font-bold text-primary hover:bg-primary/10"
                          >
                            <RefreshCw className="h-3 w-3" />
                            تجديد ٣٠ يوم
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {tenants.length === 0 && (
                    <tr>
                      <td
                        colSpan={6}
                        className="py-6 text-center font-bold text-sidebar-foreground/60"
                      >
                        لا يوجد عملاء بعد — ابدأ بإنشاء أول عميل.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </Panel>
        </div>

        <div className="mt-6 rounded-2xl border-2 border-warning/40 bg-warning/10 p-5 text-sm font-bold text-sidebar-foreground/80">
          ملاحظة صريحة: الحساب وكلمة السر المولّدان لعميل جديد يعملان فعلياً لتسجيل الدخول، لكن باقي
          صفحات النظام (المبيعات، العملاء، المخزون، الخزينة...) لسه بتعرض بيانات المحل التجريبي فقط
          لكل المستخدمين، لحد ما يتم فصل عزل البيانات لكل عميل فعلياً — خطوة تالية منفصلة، مش جزء من
          هذه الشاشة.
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  dir,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  dir?: "ltr" | "rtl";
}) {
  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold text-sidebar-foreground/70">{label}</label>
      <input
        type={type}
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
        {...(dir && { dir })}
        className="w-full rounded-md border border-sidebar-border bg-sidebar px-3 py-2 text-sm text-sidebar-foreground outline-none focus:ring-2 focus:ring-ring"
      />
    </div>
  );
}
