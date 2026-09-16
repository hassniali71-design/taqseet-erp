import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { fetchWarrantyInfo, type WarrantyInfo } from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/warranty")({
  component: WarrantyPage,
});

function WarrantyPage() {
  const session = useRequireSession();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<WarrantyInfo[] | undefined>(undefined);
  const [searching, setSearching] = useState(false);

  if (!session) return null;
  const tenantId = session.tenant_id;

  function handleSearch() {
    setSearching(true);
    fetchWarrantyInfo(tenantId, query)
      .then(setResults)
      .finally(() => setSearching(false));
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">الضمان</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §86 — للقراءة فقط، محسوب من تاريخ البيع (نقدي أو تقسيط) + مدة ضمان المنتج، بدون أي كيان
          مخزّن منفصل. البحث عام: بالاسم أو الكود أو الماركة أو الموديل أو رقم السيريال — الأجهزة
          اللي بدون سيريال بتظهر برضو بنفس الطريقة.
        </p>

        <div className="mt-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="form-input"
            placeholder="ابحث بالاسم، الكود، الماركة، الموديل، أو رقم السيريال"
          />
          <button
            onClick={handleSearch}
            disabled={searching}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            بحث
          </button>
        </div>

        {results !== undefined && results.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            لا يوجد نتائج (إما الجهاز غير موجود، أو بدون ضمان مُعرَّف، أو لسه ما اتباعش لأي عميل).
          </p>
        )}

        {results && results.length > 0 && (
          <div className="mt-6 max-h-[32rem] space-y-3 overflow-y-auto">
            {results.map((result, i) => (
              <div key={i} className="rounded-xl border border-border bg-card p-5 shadow-sm">
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <p className="text-xs text-muted-foreground">الجهاز</p>
                    <p className="text-sm font-bold text-foreground">{result.product_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">السيريال</p>
                    <p className="text-sm font-bold text-foreground" dir="ltr">
                      {result.serial_number ?? "— (بدون سيريال)"}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">العميل</p>
                    <p className="text-sm font-bold text-foreground">{result.customer_name}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">تاريخ البيع</p>
                    <p className="text-sm font-bold text-foreground" dir="ltr">
                      {new Date(result.sold_at).toLocaleDateString("ar-EG")}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">السعر</p>
                    <p className="text-sm font-bold text-foreground" dir="ltr">
                      {result.unit_price.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">مدة الضمان</p>
                    <p className="text-sm font-bold text-foreground" dir="ltr">
                      {result.warranty_months} شهر
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">نهاية الضمان</p>
                    <p className="text-sm font-bold text-foreground" dir="ltr">
                      {new Date(result.warranty_end).toLocaleDateString("ar-EG")}
                    </p>
                  </div>
                </div>
                <span
                  className={`mt-4 inline-block rounded-full px-3 py-1 text-xs font-medium ${
                    result.active
                      ? "bg-success/15 text-success"
                      : "bg-destructive/15 text-destructive"
                  }`}
                >
                  {result.active ? "الضمان سارٍ" : "الضمان منتهٍ"}
                </span>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
