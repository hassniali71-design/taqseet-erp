import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  computeProductStock,
  useAdjustStock,
  useInventoryMovements,
  useProducts,
  useProductSerials,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/stock-count")({
  component: StockCountPage,
});

function StockCountPage() {
  const session = useRequireSession();
  const [search, setSearch] = useState("");
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  const { data: allProducts = [] } = useProducts(session?.tenant_id);
  const { data: allSerials = [] } = useProductSerials(session?.tenant_id);
  const { data: allMovements = [] } = useInventoryMovements(session?.tenant_id);
  const adjustStockMutation = useAdjustStock(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  // جرد المخزون بيعرض كل الأجهزة النشطة دلوقتي (كاملة، مش بس اللي بتتجرد بكمية) — منتجات
  // السيريال بتتعرض للقراءة فقط (تعديلها من صفحة الجهاز نفسه عبر قائمة السيريالات، زي ما
  // useAdjustStock نفسه بيرفض تعديلها بهذه الطريقة)، وبحث بالاسم عشان الجرد الكامل يبقى
  // عملي حتى لو الكتالوج كبير.
  const searchLower = search.trim().toLowerCase();
  const allActiveProducts = allProducts.filter((p) => p.active);
  const filteredProducts = searchLower
    ? allActiveProducts.filter((p) => p.name.toLowerCase().includes(searchLower))
    : allActiveProducts;
  const products = filteredProducts.filter((p) => !p.serial_required);
  const serialProducts = filteredProducts.filter((p) => p.serial_required);

  function submitRow(productId: string) {
    setError(null);
    const actualRaw = actuals[productId];
    if (actualRaw === undefined || actualRaw.trim() === "") return;
    const actual = Number(actualRaw);
    const product = products.find((p) => p.id === productId);
    if (!product) return;
    const expected = computeProductStock(productId, false, allSerials, allMovements);
    const diff = actual - expected;
    if (diff !== 0 && !reasons[productId]?.trim()) {
      setError("لازم تكتب سبب الفرق قبل الحفظ");
      return;
    }
    adjustStockMutation.mutate(
      {
        product,
        actualQuantity: actual,
        reason: reasons[productId]?.trim() || "بدون فرق",
        actorUserId,
      },
      {
        onSuccess: () => {
          setActuals((prev) => ({ ...prev, [productId]: "" }));
          setReasons((prev) => ({ ...prev, [productId]: "" }));
          setSavedId(productId);
          setTimeout(() => setSavedId(null), 2000);
        },
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">جرد المخزون</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          جرد كامل لكل الأجهزة النشطة (§30). الأجهزة غير المرتبطة بسيريال تُعدَّل هنا مباشرة — أجهزة
          السيريال تُعرض للقراءة فقط ودقتها تأتي من قائمة السيريالات في صفحة كل جهاز.
        </p>

        <label className="mt-4 block max-w-sm space-y-1">
          <span className="text-xs font-medium text-foreground">بحث باسم الجهاز</span>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="form-input"
            placeholder="اكتب اسم الجهاز..."
          />
        </label>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الجهاز</th>
                <th className="px-4 py-3 font-medium">المتوقع</th>
                <th className="px-4 py-3 font-medium">الفعلي</th>
                <th className="px-4 py-3 font-medium">السبب (لو فيه فرق)</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {products.map((product) => {
                const expected = computeProductStock(product.id, false, allSerials, allMovements);
                const actualValue = actuals[product.id] ?? "";
                const diff = actualValue !== "" ? Number(actualValue) - expected : null;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {expected}
                    </td>
                    <td className="max-w-28 px-4 py-3">
                      <input
                        type="number"
                        min="0"
                        value={actualValue}
                        onChange={(e) =>
                          setActuals((prev) => ({ ...prev, [product.id]: e.target.value }))
                        }
                        className="form-input"
                        dir="ltr"
                        placeholder={String(expected)}
                      />
                      {diff !== null && diff !== 0 && (
                        <span
                          className={`mr-2 text-xs font-medium ${diff > 0 ? "text-success" : "text-destructive"}`}
                        >
                          ({diff > 0 ? "+" : ""}
                          {diff})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <input
                        value={reasons[product.id] ?? ""}
                        onChange={(e) =>
                          setReasons((prev) => ({ ...prev, [product.id]: e.target.value }))
                        }
                        className="form-input"
                        placeholder="مثال: تلف، فقد، خطأ إدخال سابق"
                      />
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">
                      <button
                        onClick={() => submitRow(product.id)}
                        className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        حفظ
                      </button>
                      {savedId === product.id && (
                        <span className="mr-2 text-xs text-success">تم ✓</span>
                      )}
                    </td>
                  </tr>
                );
              })}
              {products.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    {search
                      ? "لا يوجد أجهزة مطابقة للبحث."
                      : "لا توجد أجهزة غير مرتبطة بسيريال للجرد."}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {serialProducts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">أجهزة السيريال (للقراءة فقط)</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              الكمية هنا محسوبة من عدد السيريالات المتاحة فعليًا — للتعديل ادخل صفحة الجهاز نفسه.
            </p>
            <div className="mt-3 max-h-[20rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">الجهاز</th>
                    <th className="px-4 py-3 font-medium">المتاح (سيريال)</th>
                    <th className="px-4 py-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {serialProducts.map((product) => (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {computeProductStock(product.id, true, allSerials, allMovements)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-left">
                        <Link
                          to="/products/$id"
                          params={{ id: product.id }}
                          className="text-xs font-medium text-primary hover:underline"
                        >
                          فتح صفحة الجهاز ←
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
