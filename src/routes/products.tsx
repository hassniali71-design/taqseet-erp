import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import {
  computeProductStock,
  useCreateProduct,
  useInventoryMovements,
  useProductBrands,
  useProductCategories,
  useProductSerials,
  useProducts,
  useReceiveStock,
  useRegisterProductBrand,
  useRegisterProductCategory,
  useUpdateProduct,
} from "@/lib/supabase-queries";
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
  opening_stock: string;
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
  opening_stock: "0",
};

function toNumber(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

const UNIT_OPTIONS = ["قطعة", "دستة", "كرتونة", "طقم", "زوج"];

function ProductsPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [openingSerials, setOpeningSerials] = useState<string[]>([""]);
  const [formError, setFormError] = useState<string | null>(null);
  const [addingCategory, setAddingCategory] = useState(false);
  const [customUnit, setCustomUnit] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: products = [], isLoading } = useProducts(session?.tenant_id);
  const { data: allCategories = [] } = useProductCategories(session?.tenant_id);
  const { data: allBrands = [] } = useProductBrands(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const createProductMutation = useCreateProduct(session?.tenant_id);
  const updateProductMutation = useUpdateProduct(session?.tenant_id);
  const registerBrandMutation = useRegisterProductBrand(session?.tenant_id);
  const registerCategoryMutation = useRegisterProductCategory(session?.tenant_id);
  const receiveStockMutation = useReceiveStock(session?.tenant_id);

  if (!session) return null;
  // Extracted so nested closures below see a plain `string`, not the `Session | null` union
  // TypeScript falls back to for a captured outer variable inside a function body.
  const actorUserId = session.user_id;

  const categories = allCategories.filter((c) => c.active);
  const brands = allBrands.filter((b) => b.active);

  function startCreate() {
    setForm(EMPTY_FORM);
    setOpeningSerials([""]);
    setFormError(null);
    setAddingCategory(categories.length === 0);
    setCustomUnit(false);
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
      opening_stock: "0",
    });
    setFormError(null);
    setAddingCategory(
      categories.length === 0 || !categories.some((c) => c.name === product.category),
    );
    setCustomUnit(!UNIT_OPTIONS.includes(product.unit));
    setEditingId(product.id);
  }

  function onOpeningStockChange(value: string) {
    setForm({ ...form, opening_stock: value });
    if (form.serial_required) {
      const n = Math.max(0, Number(value) || 0);
      setOpeningSerials((prev) => {
        const next = [...prev];
        while (next.length < n) next.push("");
        return next.slice(0, Math.max(n, 1));
      });
    }
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      if (form.brand.trim()) {
        await registerBrandMutation.mutateAsync({ name: form.brand.trim(), actorUserId });
      }
      if (form.category.trim()) {
        await registerCategoryMutation.mutateAsync({ name: form.category.trim(), actorUserId });
      }
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
        const openingQty = toNumber(form.opening_stock);
        const product = await createProductMutation.mutateAsync({ input: payload, actorUserId });
        if (openingQty > 0) {
          await receiveStockMutation.mutateAsync({
            product,
            quantity: openingQty,
            serialNumbers: form.serial_required ? openingSerials : undefined,
            actorUserId,
            reference: "رصيد افتتاحي",
          });
        }
      } else if (editingId) {
        await updateProductMutation.mutateAsync({ id: editingId, patch: payload, actorUserId });
      }
      setEditingId(null);
      setForm(EMPTY_FORM);
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "حدث خطأ");
      return;
    }
  }

  function toggleActive(product: Product) {
    updateProductMutation.mutate({
      id: product.id,
      patch: { active: !product.active },
      actorUserId,
    });
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
                  list="brand-options"
                  value={form.brand}
                  onChange={(e) => setForm({ ...form, brand: e.target.value })}
                  className="form-input"
                />
                <datalist id="brand-options">
                  {brands.map((b) => (
                    <option key={b.id} value={b.name} />
                  ))}
                </datalist>
              </Field>
              <Field label="الموديل">
                <input
                  value={form.model}
                  onChange={(e) => setForm({ ...form, model: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الفئة">
                {addingCategory || categories.length === 0 ? (
                  <div className="flex gap-2">
                    <input
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="form-input"
                      placeholder="اسم فئة جديدة، مثلاً: ثلاجات"
                    />
                    {categories.length > 0 && (
                      <button
                        type="button"
                        onClick={() => setAddingCategory(false)}
                        className="whitespace-nowrap rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        اختيار من القائمة
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="flex gap-2">
                    <select
                      value={form.category}
                      onChange={(e) => setForm({ ...form, category: e.target.value })}
                      className="form-input"
                    >
                      <option value="">اختر فئة</option>
                      {categories.map((c) => (
                        <option key={c.id} value={c.name}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => {
                        setAddingCategory(true);
                        setForm({ ...form, category: "" });
                      }}
                      className="whitespace-nowrap rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      + فئة جديدة
                    </button>
                  </div>
                )}
              </Field>
              <Field label="الوحدة">
                {customUnit ? (
                  <div className="flex gap-2">
                    <input
                      value={form.unit}
                      onChange={(e) => setForm({ ...form, unit: e.target.value })}
                      className="form-input"
                      placeholder="وحدة مخصصة"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        setCustomUnit(false);
                        setForm({ ...form, unit: UNIT_OPTIONS[0] ?? "قطعة" });
                      }}
                      className="whitespace-nowrap rounded-md border border-input px-3 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      اختيار من القائمة
                    </button>
                  </div>
                ) : (
                  <select
                    value={form.unit}
                    onChange={(e) => {
                      if (e.target.value === "__other__") {
                        setCustomUnit(true);
                        setForm({ ...form, unit: "" });
                      } else {
                        setForm({ ...form, unit: e.target.value });
                      }
                    }}
                    className="form-input"
                  >
                    {UNIT_OPTIONS.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                    <option value="__other__">أخرى...</option>
                  </select>
                )}
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
                <span className="block text-[11px] text-muted-foreground">
                  لما الكمية المتاحة توصل للرقم ده أو أقل، هيظهر تنبيه "مخزون منخفض" في لوحة التحكم
                  والإشعارات.
                </span>
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

            {editingId === "new" && (
              <div className="rounded-lg border border-border bg-muted/30 p-3">
                <Field label="الكمية المتاحة الآن (اختياري)">
                  <input
                    type="number"
                    min="0"
                    value={form.opening_stock}
                    onChange={(e) => onOpeningStockChange(e.target.value)}
                    className="form-input max-w-xs"
                    dir="ltr"
                  />
                  <span className="block text-[11px] text-muted-foreground">
                    لو عندك كمية جاهزة تتباع دلوقتي من الجهاز ده، اكتبها هنا فتتسجل فورًا في
                    المخزون. سيبها 0 لو مفيش كمية دلوقتي — تقدر تضيف كمية في أي وقت لاحق من زرار
                    "استلام كمية" داخل صفحة الجهاز نفسه.
                  </span>
                </Field>
                {form.serial_required && toNumber(form.opening_stock) > 0 && (
                  <div className="mt-3 space-y-2">
                    <span className="text-xs font-medium text-foreground">
                      أرقام السيريال ({openingSerials.length})
                    </span>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {openingSerials.map((value, i) => (
                        <input
                          key={i}
                          required
                          value={value}
                          onChange={(e) => {
                            const next = [...openingSerials];
                            next[i] = e.target.value;
                            setOpeningSerials(next);
                          }}
                          placeholder={`سيريال #${i + 1}`}
                          className="form-input"
                          dir="ltr"
                        />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {formError && <p className="text-sm text-destructive">{formError}</p>}

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
                  setFormError(null);
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
                    {computeProductStock(
                      product.id,
                      product.serial_required,
                      allSerials,
                      allMovements,
                    )}
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
                    {isLoading ? "جارٍ التحميل..." : "لا يوجد أجهزة بعد."}
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
