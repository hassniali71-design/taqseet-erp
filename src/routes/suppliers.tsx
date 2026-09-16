import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { StatCard } from "@/components/ui/StatCard";
import { subscribeData } from "@/lib/data-store";
import {
  computeSupplierBalance,
  useCreateSupplier,
  usePurchases,
  useSupplierPayments,
  useSuppliers,
  useUpdateSupplier,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import type { Supplier } from "@/types";

export const Route = createFileRoute("/suppliers")({
  component: SuppliersPage,
});

type FormState = {
  name: string;
  phone: string;
  address: string;
  notes: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  address: "",
  notes: "",
};

function SuppliersPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: suppliers = [] } = useSuppliers(session?.tenant_id);
  const { data: allPurchases = [] } = usePurchases(session?.tenant_id);
  const { data: allPayments = [] } = useSupplierPayments(session?.tenant_id);
  const createSupplierMutation = useCreateSupplier(session?.tenant_id);
  const updateSupplierMutation = useUpdateSupplier(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(supplier: Supplier) {
    setForm({
      name: supplier.name,
      phone: supplier.phone,
      address: supplier.address ?? "",
      notes: supplier.notes ?? "",
    });
    setEditingId(supplier.id);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      phone: form.phone.trim(),
      ...(form.address.trim() && { address: form.address.trim() }),
      ...(form.notes.trim() && { notes: form.notes.trim() }),
    };
    if (editingId === "new") {
      createSupplierMutation.mutate({ input: payload, actorUserId });
    } else if (editingId) {
      updateSupplierMutation.mutate({ id: editingId, patch: payload, actorUserId });
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleActive(supplier: Supplier) {
    updateSupplierMutation.mutate({
      id: supplier.id,
      patch: { active: !supplier.active },
      actorUserId,
    });
  }

  const volumeBySupplier = new Map<string, { total: number; count: number }>();
  for (const purchase of allPurchases) {
    const current = volumeBySupplier.get(purchase.supplier_id) ?? { total: 0, count: 0 };
    current.total += purchase.total;
    current.count += 1;
    volumeBySupplier.set(purchase.supplier_id, current);
  }
  const topSuppliers = suppliers
    .map((s) => ({ supplier: s, ...(volumeBySupplier.get(s.id) ?? { total: 0, count: 0 }) }))
    .filter((s) => s.count > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 3);

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">الموردون</h1>
          {editingId === null && (
            <button
              onClick={startCreate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة مورد
            </button>
          )}
        </div>

        {editingId !== null && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">
              {editingId === "new" ? "مورد جديد" : "تعديل بيانات المورد"}
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
              <Field label="العنوان">
                <input
                  value={form.address}
                  onChange={(e) => setForm({ ...form, address: e.target.value })}
                  className="form-input"
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

        {topSuppliers.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            {topSuppliers.map(({ supplier, total, count }, i) => (
              <StatCard
                key={supplier.id}
                label={i === 0 ? "أكبر مورد (بحجم الشراء)" : supplier.name}
                value={`${total.toLocaleString("ar-EG")} ج.م`}
                sub={`${count} أمر شراء`}
                valueDir="ltr"
                tone={i === 0 ? "primary" : "default"}
              />
            ))}
          </div>
        )}

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الكود</th>
                <th className="px-4 py-3 font-medium">الاسم</th>
                <th className="px-4 py-3 font-medium">الهاتف</th>
                <th className="px-4 py-3 font-medium">العنوان</th>
                <th className="px-4 py-3 font-medium">الرصيد المستحق</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {suppliers.map((supplier) => (
                <tr key={supplier.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {supplier.code}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      to="/suppliers/$id"
                      params={{ id: supplier.id }}
                      className="hover:underline"
                    >
                      {supplier.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {supplier.phone}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{supplier.address ?? "—"}</td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {computeSupplierBalance(supplier.id, allPurchases, allPayments).toLocaleString(
                      "ar-EG",
                    )}{" "}
                    ج.م
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        supplier.active
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {supplier.active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-left">
                    <button
                      onClick={() => startEdit(supplier)}
                      className="ml-2 text-xs font-medium text-primary hover:underline"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => toggleActive(supplier)}
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      {supplier.active ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
              {suppliers.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد موردون بعد.
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
