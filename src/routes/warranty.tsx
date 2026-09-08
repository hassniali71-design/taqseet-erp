import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { getWarrantyInfo } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { WarrantyInfo } from "@/lib/data-store";

export const Route = createFileRoute("/warranty")({
  component: WarrantyPage,
});

function WarrantyPage() {
  const session = useRequireSession();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<WarrantyInfo | null | undefined>(undefined);

  if (!session) return null;
  const tenantId = session.tenant_id;

  function handleSearch() {
    setResult(getWarrantyInfo(query, tenantId));
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-2xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">الضمان</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §86 — للقراءة فقط، محسوب من تاريخ البيع (نقدي أو تقسيط) + مدة ضمان المنتج، بدون أي كيان
          مخزّن منفصل.
        </p>

        <div className="mt-6 flex gap-2">
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSearch()}
            className="form-input"
            dir="ltr"
            placeholder="ابحث برقم السيريال"
          />
          <button
            onClick={handleSearch}
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            بحث
          </button>
        </div>

        {result === null && (
          <p className="mt-4 text-sm text-muted-foreground">
            لا يوجد ضمان مسجّل لهذا السيريال (إما السيريال غير موجود، أو المنتج بدون ضمان، أو
            السيريال لسه ما اتباعش).
          </p>
        )}

        {result && (
          <div className="mt-6 rounded-xl border border-border bg-card p-5 shadow-sm">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs text-muted-foreground">الجهاز</p>
                <p className="text-sm font-bold text-foreground">{result.product_name}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">السيريال</p>
                <p className="text-sm font-bold text-foreground" dir="ltr">
                  {result.serial_number}
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
                result.active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"
              }`}
            >
              {result.active ? "الضمان سارٍ" : "الضمان منتهٍ"}
            </span>
          </div>
        )}
      </main>
    </div>
  );
}
