import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { adjustStock, getProductStock, getProducts, subscribeData } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/stock-count")({
  component: StockCountPage,
});

function StockCountPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [actuals, setActuals] = useState<Record<string, string>>({});
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const products = getProducts(session.tenant_id).filter((p) => p.active && !p.serial_required);

  function submitRow(productId: string) {
    setError(null);
    const actualRaw = actuals[productId];
    if (actualRaw === undefined || actualRaw.trim() === "") return;
    const actual = Number(actualRaw);
    const expected = getProductStock(productId);
    const diff = actual - expected;
    if (diff !== 0 && !reasons[productId]?.trim()) {
      setError("لازم تكتب سبب الفرق قبل الحفظ");
      return;
    }
    try {
      adjustStock(productId, actual, reasons[productId]?.trim() || "بدون فرق", actorUserId);
      setActuals((prev) => ({ ...prev, [productId]: "" }));
      setReasons((prev) => ({ ...prev, [productId]: "" }));
      setSavedId(productId);
      setTimeout(() => setSavedId(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">جرد المخزون</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          فقط المنتجات غير المرتبطة بسيريال تُجرد هنا (§30) — دقة منتجات السيريال تأتي من قائمة
          السيريالات نفسها في صفحة كل جهاز.
        </p>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
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
                const expected = getProductStock(product.id, product);
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
                    لا توجد أجهزة غير مرتبطة بسيريال للجرد.
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
