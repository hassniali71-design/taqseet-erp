import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { RiskBadge } from "@/components/ui/StatCard";
import {
  computeCustomerExposure,
  computeCustomerRiskAssessment,
  dateInputToTimestamp,
  useCreateCustomer,
  useCurrentTenantSettings,
  useCustomers,
  useDeleteCustomer,
  useInstallmentContracts,
  useInstallmentPayments,
  useInstallments,
  usePromisesToPay,
  useSales,
  useUpdateCustomer,
} from "@/lib/supabase-queries";
import { useOwnerPasswordConfirm } from "@/hooks/use-owner-password-confirm";
import { useRequireSession } from "@/hooks/use-session";
import type { Customer } from "@/types";

export const Route = createFileRoute("/customers")({
  component: CustomersPage,
});

type FormState = {
  name: string;
  phone: string;
  alt_phone: string;
  address: string;
  notes: string;
  credit_limit: string;
  join_date: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  alt_phone: "",
  address: "",
  notes: "",
  credit_limit: "0",
  join_date: "",
};

function CustomersPage() {
  const session = useRequireSession();
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const { data: customers = [], isLoading } = useCustomers(session?.tenant_id);
  const { data: settingsData } = useCurrentTenantSettings(session?.tenant_id);
  const { data: contracts = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: installments = [] } = useInstallments(session?.tenant_id);
  const { data: payments = [] } = useInstallmentPayments(session?.tenant_id);
  const { data: promises = [] } = usePromisesToPay(session?.tenant_id);
  const { data: sales = [] } = useSales(session?.tenant_id);
  const createCustomerMutation = useCreateCustomer(session?.tenant_id);
  const updateCustomerMutation = useUpdateCustomer(session?.tenant_id);
  const deleteCustomerMutation = useDeleteCustomer(session?.tenant_id);
  const { requestConfirm, dialog: passwordDialog } = useOwnerPasswordConfirm();
  const [deleteError, setDeleteError] = useState<string | null>(null);

  if (!session) return null;
  const gracePeriodDays = settingsData?.grace_period_days ?? 3;
  // Extracted so nested closures below see a plain `string`, not the `Session | null` union
  // TypeScript falls back to for a captured outer variable inside a function body.
  const actorUserId = session.user_id;

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(customer: Customer) {
    setForm({
      name: customer.name,
      phone: customer.phone,
      alt_phone: customer.alt_phone ?? "",
      address: customer.address ?? "",
      notes: customer.notes ?? "",
      credit_limit: String(customer.credit_limit),
      join_date: "",
    });
    setEditingId(customer.id);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      credit_limit: Number(form.credit_limit) || 0,
      ...(form.alt_phone.trim() && { alt_phone: form.alt_phone.trim() }),
      ...(form.address.trim() && { address: form.address.trim() }),
      ...(form.notes.trim() && { notes: form.notes.trim() }),
    };
    if (editingId === "new") {
      createCustomerMutation.mutate({
        input: payload,
        actorUserId,
        ...(form.join_date && { createdAt: dateInputToTimestamp(form.join_date) }),
      });
    } else if (editingId) {
      updateCustomerMutation.mutate({ id: editingId, patch: payload, actorUserId });
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleStatus(customer: Customer) {
    updateCustomerMutation.mutate({
      id: customer.id,
      patch: { status: customer.status === "active" ? "inactive" : "active" },
      actorUserId,
    });
  }

  async function handleDelete(customer: Customer) {
    setDeleteError(null);
    if (
      !window.confirm(
        `حذف "${customer.name}" نهائيًا؟ فواتير البيع القديمة بتاعته هتفضل محفوظة برقمها ومبلغها بدون ما تتأثر، بس هتبقى بدون اسم عميل مرتبط.`,
      )
    ) {
      return;
    }
    const confirmed = await requestConfirm();
    if (!confirmed) return;
    try {
      await deleteCustomerMutation.mutateAsync({ id: customer.id, actorUserId });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "حدث خطأ أثناء الحذف");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">العملاء</h1>
          {editingId === null && (
            <button
              onClick={startCreate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة عميل
            </button>
          )}
        </div>

        {editingId !== null && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">
              {editingId === "new" ? "عميل جديد" : "تعديل بيانات العميل"}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="الاسم *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الهاتف *">
                <input
                  required
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="هاتف بديل">
                <input
                  value={form.alt_phone}
                  onChange={(e) => setForm({ ...form, alt_phone: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="العنوان">
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="حد الائتمان (للتقسيط)">
                <input
                  type="number"
                  min="0"
                  value={form.credit_limit}
                  onChange={(e) => setForm({ ...form, credit_limit: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              {editingId === "new" && (
                <Field label="تاريخ الانضمام (سيبه فاضي لو دلوقتي)">
                  <input
                    type="date"
                    value={form.join_date}
                    onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                    className="form-input"
                    dir="ltr"
                  />
                </Field>
              )}
            </div>
            <Field label="ملاحظات">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="form-input"
                rows={2}
              />
            </Field>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditingId(null);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">الهاتف</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">إجمالي المشتريات</th>
                <th className="px-4 py-3 font-medium">المديونية الحالية</th>
                <th className="px-4 py-3 font-medium">حد الائتمان</th>
                <th className="px-4 py-3 font-medium">التقييم</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => {
                const totalPurchased =
                  sales
                    .filter((s) => s.customer_id === customer.id)
                    .reduce((sum, s) => sum + (s.total ?? 0), 0) +
                  contracts
                    .filter((c) => c.customer_id === customer.id)
                    .reduce((sum, c) => sum + (c.total_amount ?? 0), 0);
                const exposure = computeCustomerExposure(customer.id, contracts, installments);
                return (
                  <tr key={customer.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {customer.code}
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        to="/customers/$id"
                        params={{ id: customer.id }}
                        className="hover:underline"
                      >
                        {customer.name}
                      </Link>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {customer.phone}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{customer.address ?? "—"}</td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {totalPurchased.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${exposure > 0 ? "text-warning" : "text-muted-foreground"}`}
                      dir="ltr"
                    >
                      {exposure.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {(customer.credit_limit ?? 0).toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3">
                      <RiskBadge
                        assessment={computeCustomerRiskAssessment(
                          customer.id,
                          contracts,
                          installments,
                          payments,
                          promises,
                          gracePeriodDays,
                        )}
                      />
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          customer.status === "active"
                            ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                            : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                        }
                      >
                        {customer.status === "active" ? "نشط" : "موقوف"}
                      </span>
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 text-left">
                      <button
                        onClick={() => startEdit(customer)}
                        className="ml-2 text-xs font-medium text-primary hover:underline"
                      >
                        تعديل
                      </button>
                      <button
                        onClick={() => toggleStatus(customer)}
                        className="ml-2 text-xs font-medium text-muted-foreground hover:underline"
                      >
                        {customer.status === "active" ? "إيقاف" : "تفعيل"}
                      </button>
                      <button
                        onClick={() => void handleDelete(customer)}
                        className="text-xs font-medium text-destructive hover:underline"
                      >
                        حذف
                      </button>
                    </td>
                  </tr>
                );
              })}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-6 text-center text-muted-foreground">
                    {isLoading ? "جارٍ التحميل..." : "لا يوجد عملاء بعد."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError}</p>}
        {passwordDialog}
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
