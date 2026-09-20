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

  // جرد المخزون — قائمة واحدة موحّدة لكل الأجهزة النشطة (مش جدولين منفصلين)، فيها كل
  // الكتالوج مع بعض. الأجهزة غير المرتبطة بسيريال قابلة للتعديل المباشر هنا؛ أجهزة السيريال
  // بتتعرض بنفس القائمة بس بعدّاد للقراءة فقط (تعديلها من قائمة السيريالات في صفحة الجهاز
  // نفسه، زي ما useAdjustStock نفسه بيرفض تعديلها بطريقة "كمية واحدة" — كل سيريال له حالة
  // مستقلة). بحث بالاسم عشان الجرد يبقى عملي حتى لو الكتالوج كبير.
  const searchLower = search.trim().toLowerCase();
  const allActiveProducts = allProducts.filter((p) => p.active);
  const filteredProducts = (
    searchLower
      ? allActiveProducts.filter((p) => p.name.toLowerCase().includes(searchLower))
      : allActiveProducts
  ).sort((a, b) => a.name.localeCompare(b.name, "ar"));

  function submitRow(productId: string) {
    setError(null);
    const actualRaw = actuals[productId];
    if (actualRaw === undefined || actualRaw.trim() === "") return;
    const actual = Number(actualRaw);
    const product = allActiveProducts.find((p) => p.id === productId);
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
      <main className="flex-1 mx-auto max-w-6xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">جرد المخزون</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          جرد كامل لكل أجهزة المخزون النشطة ({filteredProducts.length} جهاز) في قائمة واحدة —
          الأجهزة غير المرتبطة بسيريال تُعدَّل هنا مباشرة، وأجهزة السيريال (§30) للقراءة فقط — دقتها
          تأتي من قائمة السيريالات في صفحة كل جهاز، وليها رابط مباشر هنا.
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

        <div className="mt-6 max-h-[40rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">الجهاز</th>
                <th className="px-4 py-3 font-medium">النوع</th>
                <th className="px-4 py-3 font-medium">المتوقع</th>
                <th className="px-4 py-3 font-medium">الفعلي</th>
                <th className="px-4 py-3 font-medium">السبب (لو فيه فرق)</th>
                <th className="px-4 py-3 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {filteredProducts.map((product) => {
                const expected = computeProductStock(
                  product.id,
                  product.serial_required,
                  allSerials,
                  allMovements,
                );
                if (product.serial_required) {
                  return (
                    <tr key={product.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
                          سيريال
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {expected}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" colSpan={2}>
                        للقراءة فقط — عدّل من صفحة الجهاز
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
                  );
                }
                const actualValue = actuals[product.id] ?? "";
                const diff = actualValue !== "" ? Number(actualValue) - expected : null;
                return (
                  <tr key={product.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{product.name}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full bg-primary/10 px-2 py-0.5 text-xs font-medium text-primary">
                        بالكمية
                      </span>
                    </td>
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
              {filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                    {search ? "لا يوجد أجهزة مطابقة للبحث." : "لا توجد أجهزة نشطة بعد."}
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
