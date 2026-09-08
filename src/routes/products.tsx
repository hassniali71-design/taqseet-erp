import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  createProduct,
  getProductStock,
  getProducts,
  subscribeData,
  updateProduct,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { Product } from "@/types";

export const Route = createFileRoute("/products")({
  component: ProductsPage,
});

type FormState = {
  name: string;
  brand: string;
  model: string;
  category: string;
  unit: string;
  cost_price: string;
  cash_price: string;
  installment_price: string;
  min_stock: string;
  max_stock: string;
  warranty_months: string;
  serial_required: boolean;
};

const EMPTY_FORM: FormState = {
  name: "",
  brand: "",
  model: "",
  category: "",
  unit: "قطعة",
  cost_price: "",
  cash_price: "",
  installment_price: "",
  min_stock: "0",
  max_stock: "0",
  warranty_months: "",
  serial_required: true,
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function ProductsPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  // Extracted so nested closures below see a plain `string`, not the `Session | null` union
  // TypeScript falls back to for a captured outer variable inside a function body.
  const actorUserId = session.user_id;

  const products = getProducts(session.tenant_id);

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(product: Product) {
    setForm({
      name: product.name,
      brand: product.brand ?? "",
      model: product.model ?? "",
      category: product.category ?? "",
      unit: product.unit,
      cost_price: String(product.cost_price),
      cash_price: String(product.cash_price),
      installment_price: String(product.installment_price),
      min_stock: String(product.min_stock),
      max_stock: String(product.max_stock),
      warranty_months: product.warranty_months ? String(product.warranty_months) : "",
      serial_required: product.serial_required,
    });
    setEditingId(product.id);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      ...(form.brand.trim() && { brand: form.brand.trim() }),
      ...(form.model.trim() && { model: form.model.trim() }),
      ...(form.category.trim() && { category: form.category.trim() }),
      unit: form.unit.trim() || "قطعة",
      cost_price: toNumber(form.cost_price),
      cash_price: toNumber(form.cash_price),
      installment_price: toNumber(form.installment_price),
      min_stock: toNumber(form.min_stock),
      max_stock: toNumber(form.max_stock),
      ...(form.warranty_months && { warranty_months: toNumber(form.warranty_months) }),
      serial_required: form.serial_required,
    };
    if (editingId === "new") {
      createProduct(payload, actorUserId);
    } else if (editingId) {
      updateProduct(editingId, payload, actorUserId);
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleActive(product: Product) {
    updateProduct(product.id, { active: !product.active }, actorUserId);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">الأجهزة (المنتجات)</h1>
          {editingId === null && (
            <button
              onClick={startCreate}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة جهاز
            </button>
          )}
        </div>

        {editingId !== null && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">
              {editingId === "new" ? "جهاز جديد" : "تعديل بيانات الجهاز"}
            </h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <Field label="الاسم *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الماركة">
                <input
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الموديل">
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الفئة">
                <input
                  value={form.category}
                  onChange={(e) => setForm({ ...form, category: e.target.value })}
                  className="form-input"
                  placeholder="ثلاجات، غسالات، ..."
                />
              </Field>
              <Field label="الوحدة">
                <input
                  value={form.unit}
                  onChange={(e) => setForm({ ...form, unit: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الضمان (بالشهور)">
                <input
                  type="number"
                  min="0"
                  value={form.warranty_months}
                  onChange={(e) => setForm({ ...form, warranty_months: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="سعر التكلفة">
                <input
                  type="number"
                  min="0"
                  required
                  value={form.cost_price}
                  onChange={(e) => setForm({ ...form, cost_price: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="السعر النقدي *">
                <input
                  type="number"
                  min="0"
                  required
                  value={form.cash_price}
                  onChange={(e) => setForm({ ...form, cash_price: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="سعر التقسيط *">
                <input
                  type="number"
                  min="0"
                  required
                  value={form.installment_price}
                  onChange={(e) => setForm({ ...form, installment_price: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الحد الأدنى للمخزون">
                <input
                  type="number"
                  min="0"
                  value={form.min_stock}
                  onChange={(e) => setForm({ ...form, min_stock: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الحد الأقصى للمخزون">
                <input
                  type="number"
                  min="0"
                  value={form.max_stock}
                  onChange={(e) => setForm({ ...form, max_stock: e.target.value })}
                  className="form-input"
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.serial_required}
                  onChange={(e) => setForm({ ...form, serial_required: e.target.checked })}
                />
                يحتاج سيريال (جهاز فردي)
              </label>
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
                <th className="px-4 py-3 font-medium">الماركة/الموديل</th>
                <th className="px-4 py-3 font-medium">المخزون</th>
                <th className="px-4 py-3 font-medium">السعر النقدي</th>
                <th className="px-4 py-3 font-medium">سعر التقسيط</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => (
                <tr key={product.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {product.code}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      to="/products/$id"
                      params={{ id: product.id }}
                      className="hover:underline"
                    >
                      {product.name}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {[product.brand, product.model].filter(Boolean).join(" / ") || "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {getProductStock(product.id, product)}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {product.cash_price.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {product.installment_price.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={
                        product.active
                          ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                          : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
                      }
                    >
                      {product.active ? "نشط" : "موقوف"}
                    </span>
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-left">
                    <button
                      onClick={() => startEdit(product)}
                      className="ml-2 text-xs font-medium text-primary hover:underline"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => toggleActive(product)}
                      className="text-xs font-medium text-muted-foreground hover:underline"
                    >
                      {product.active ? "إيقاف" : "تفعيل"}
                    </button>
                  </td>
                </tr>
              ))}
              {products.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد أجهزة بعد.
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
