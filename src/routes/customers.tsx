import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { RiskBadge } from "@/components/ui/StatCard";
import {
  createCustomer,
  getCustomerRiskAssessment,
  getCustomers,
  subscribeData,
  updateCustomer,
} from "@/lib/data-store";
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
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  alt_phone: "",
  address: "",
  notes: "",
  credit_limit: "0",
};

function CustomersPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  // Extracted so nested closures below see a plain `string`, not the `Session | null` union
  // TypeScript falls back to for a captured outer variable inside a function body.
  const actorUserId = session.user_id;

  const customers = getCustomers();

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
      createCustomer(payload, actorUserId);
    } else if (editingId) {
      updateCustomer(editingId, payload, actorUserId);
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleStatus(customer: Customer) {
    updateCustomer(
      customer.id,
      { status: customer.status === "active" ? "inactive" : "active" },
      actorUserId,
    );
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

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">الهاتف</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">حد الائتمان</th>
                <th className="px-4 py-3 font-medium">التقييم</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {customers.map((customer) => (
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
                    {customer.credit_limit.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="px-4 py-3">
                    <RiskBadge assessment={getCustomerRiskAssessment(customer.id)} />
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
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      {customer.status === "active" ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
              {customers.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد عملاء بعد.
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

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
