import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { toast } from "sonner";

import { AppSidebar } from "@/components/AppSidebar";
import {
  useCreateUserRecord,
  useRoles,
  useSeedSystemRoles,
  useSetUserActive,
  useUserRoles,
  useUsers,
} from "@/lib/supabase-queries";
import { getAccessToken } from "@/lib/supabase-client";
import { createTenantUserWithAuth } from "@/lib/user-provisioning-server";
import { sendCredentialsServer } from "@/lib/twilio-server";
import { useRequireSession } from "@/hooks/use-session";
import type { User } from "@/types";

export const Route = createFileRoute("/users")({
  component: UsersPage,
});

type FormState = {
  full_name: string;
  email: string;
  password: string;
  phone: string;
  role_id: string;
};

const EMPTY_FORM: FormState = { full_name: "", email: "", password: "", phone: "", role_id: "" };

interface JustCreatedUser {
  userId: string;
  fullName: string;
  email: string;
  password: string;
  phone: string;
}

function UsersPage() {
  const session = useRequireSession();
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [justCreatedUser, setJustCreatedUser] = useState<JustCreatedUser | null>(null);

  const { data: roles = [], isLoading: rolesLoading } = useRoles(session?.tenant_id);
  const { data: users = [] } = useUsers(session?.tenant_id);
  const { data: userRoles = [] } = useUserRoles(session?.tenant_id);
  const setUserActiveMutation = useSetUserActive(session?.tenant_id);
  const seedRolesMutation = useSeedSystemRoles(session?.tenant_id);

  useEffect(() => {
    if (!rolesLoading && roles.length === 0 && session?.tenant_id) {
      seedRolesMutation.mutate();
    }
    // Only re-check when the roles list itself changes — seedRolesMutation is a fresh object
    // every render and must not retrigger this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rolesLoading, roles.length, session?.tenant_id]);
  const createUserWithAuthMutation = useMutation({
    mutationFn: async (vars: {
      fullName: string;
      email: string;
      password: string;
      phone?: string;
      roleId?: string;
    }) => createTenantUserWithAuth({ data: { ...vars, accessToken: await getAccessToken() } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["users", session?.tenant_id] });
      void queryClient.invalidateQueries({ queryKey: ["user_roles", session?.tenant_id] });
      void queryClient.invalidateQueries({ queryKey: ["audit-logs", session?.tenant_id] });
    },
  });
  // Falls back to a record-only user (no real Auth login — the pre-existing behavior) if the
  // real-login path fails, e.g. the server's SUPABASE_SERVICE_ROLE_KEY isn't configured on
  // this deployment yet. Keeps "+ إضافة مستخدم" always working for the client instead of
  // surfacing an infra error, and starts creating real logins automatically the moment that's
  // fixed — no further code change needed.
  const createUserRecordFallback = useCreateUserRecord(session?.tenant_id);
  const sendCredentialsMutation = useMutation({
    mutationFn: async (vars: {
      tenantId: string;
      userId: string;
      phone: string;
      email: string;
      password: string;
      channel: "sms" | "whatsapp";
    }) => sendCredentialsServer({ data: { ...vars, accessToken: await getAccessToken() } }),
    onSuccess: (r) => toast.success(r.skipped ? "تم الإرسال مسبقًا اليوم" : "تم الإرسال"),
    onError: (e) => toast.error(e instanceof Error ? e.message : "تعذّر الإرسال"),
  });

  if (!session) return null;
  const actorUserId = session.user_id;

  function roleLabel(userId: string): string {
    const roleIds = new Set(
      userRoles.filter((ur) => ur.user_id === userId).map((ur) => ur.role_id),
    );
    const names = roles.filter((r) => roleIds.has(r.id)).map((r) => roleNameAr(r.name));
    return names.length > 0 ? names.join("، ") : "بلا دور";
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!session) return;
    const resetForm = () => {
      setForm({ full_name: "", email: "", password: "", phone: "", role_id: roles[0]?.id ?? "" });
      setShowForm(false);
    };
    try {
      const created = await createUserWithAuthMutation.mutateAsync({
        fullName: form.full_name.trim(),
        email: form.email.trim(),
        password: form.password,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
        ...(form.role_id && { roleId: form.role_id }),
      });
      if (form.phone.trim()) {
        setJustCreatedUser({
          userId: created.id as string,
          fullName: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          phone: form.phone.trim(),
        });
      }
      resetForm();
    } catch {
      createUserRecordFallback.mutate(
        {
          input: {
            full_name: form.full_name.trim(),
            email: form.email.trim(),
            ...(form.role_id && { roleId: form.role_id }),
          },
          actorUserId,
        },
        {
          onSuccess: resetForm,
          onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
        },
      );
    }
  }

  function toggleActive(user: User) {
    if (user.id === actorUserId) return; // can't deactivate yourself from this screen
    setUserActiveMutation.mutate({ userId: user.id, active: !user.active, actorUserId });
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">المستخدمون</h1>
          {!showForm && (
            <button
              onClick={() => {
                setForm({ ...EMPTY_FORM, role_id: roles[0]?.id ?? "" });
                setShowForm(true);
              }}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة مستخدم
            </button>
          )}
        </div>

        {justCreatedUser && (
          <div className="mt-4 rounded-xl border-2 border-primary/60 bg-primary/10 p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-bold text-foreground">
                إرسال بيانات الدخول لـ{justCreatedUser.fullName}
              </p>
              <button
                onClick={() => setJustCreatedUser(null)}
                className="text-xs font-medium text-muted-foreground hover:underline"
              >
                إخفاء
              </button>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                onClick={() =>
                  sendCredentialsMutation.mutate({
                    tenantId: session.tenant_id,
                    userId: justCreatedUser.userId,
                    phone: justCreatedUser.phone,
                    email: justCreatedUser.email,
                    password: justCreatedUser.password,
                    channel: "sms",
                  })
                }
                disabled={sendCredentialsMutation.isPending}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                إرسال عبر SMS
              </button>
              <button
                onClick={() =>
                  sendCredentialsMutation.mutate({
                    tenantId: session.tenant_id,
                    userId: justCreatedUser.userId,
                    phone: justCreatedUser.phone,
                    email: justCreatedUser.email,
                    password: justCreatedUser.password,
                    channel: "whatsapp",
                  })
                }
                disabled={sendCredentialsMutation.isPending}
                className="rounded-md border border-primary/50 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary/10 disabled:opacity-50"
              >
                إرسال عبر واتساب
              </button>
            </div>
          </div>
        )}

        {showForm && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">مستخدم جديد</h2>
            <p className="text-xs text-muted-foreground">
              بيتم إنشاء حساب دخول حقيقي فورًا بالبريد وكلمة السر دول — الموظف يقدر يدخل من صفحة
              تسجيل الدخول مباشرة بصلاحيات دوره المحدد تحت.
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="الاسم *">
                <input
                  required
                  value={form.full_name}
                  onChange={(e) => setForm({ ...form, full_name: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="البريد الإلكتروني *">
                <input
                  required
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="كلمة السر *">
                <input
                  required
                  minLength={6}
                  type="text"
                  value={form.password}
                  onChange={(e) => setForm({ ...form, password: e.target.value })}
                  className="form-input"
                  dir="ltr"
                  placeholder="6 أحرف على الأقل"
                />
              </Field>
              <Field label="الدور">
                <select
                  value={form.role_id}
                  onChange={(e) => setForm({ ...form, role_id: e.target.value })}
                  className="form-input"
                >
                  {roles.map((role) => (
                    <option key={role.id} value={role.id}>
                      {roleNameAr(role.name)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="رقم الهاتف (اختياري — لإرسال بيانات الدخول SMS/واتساب)">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
            </div>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
            {error && <p className="text-sm text-destructive">{error}</p>}
          </form>
        )}

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">البريد</th>
                <th className="px-4 py-3 font-medium">الدور</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    {user.full_name}
                    {user.id === actorUserId && (
                      <span className="mr-2 text-xs text-muted-foreground">(أنت)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {user.email}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{roleLabel(user.id)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        user.active
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {user.active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-left">
                    {user.id !== actorUserId && (
                      <button
                        onClick={() => toggleActive(user)}
                        className="text-xs font-medium text-muted-foreground hover:underline"
                      >
                        {user.active ? "إيقاف" : "تفعيل"}
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}

function roleNameAr(name: string): string {
  const map: Record<string, string> = {
    owner: "مالك",
    manager: "مدير",
    sales: "مبيعات",
    cashier: "كاشير",
    warehouse: "مخزن",
    purchasing: "مشتريات",
    collections: "تحصيل",
    accountant: "محاسب",
  };
  return map[name] ?? name;
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
