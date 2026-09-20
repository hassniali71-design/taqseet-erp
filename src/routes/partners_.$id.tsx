import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import {
  computePartnerAllocatedCost,
  computePartnerBalance,
  computePartnerTotalFunded,
  useAddPartnerFunding,
  useInstallmentContracts,
  usePartners,
  usePartnerTransactions,
  useProducts,
  useSales,
  useWithdrawPartnerFunds,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/partners_/$id")({
  component: PartnerDetailPage,
});

const TYPE_LABEL: Record<string, string> = {
  funding: "تمويل",
  withdrawal: "سحب",
  sale_settlement: "تسوية صفقة",
  adjustment: "تسوية يدوية",
};

function PartnerDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [actionMode, setActionMode] = useState<"funding" | "withdrawal">("funding");
  const [actionAmount, setActionAmount] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: partners = [], isLoading } = usePartners(session?.tenant_id);
  const { data: allTransactions = [] } = usePartnerTransactions(session?.tenant_id);
  const { data: products = [] } = useProducts(session?.tenant_id);
  const { data: sales = [] } = useSales(session?.tenant_id);
  const { data: contracts = [] } = useInstallmentContracts(session?.tenant_id);
  const addFundingMutation = useAddPartnerFunding(session?.tenant_id);
  const withdrawMutation = useWithdrawPartnerFunds(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  const partner = partners.find((p) => p.id === id);
  if (!partner) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-5xl px-4 py-8 text-center text-muted-foreground">
          {isLoading ? (
            "جارٍ التحميل..."
          ) : (
            <>
              الشريك غير موجود.{" "}
              <Link to="/partners" className="text-primary hover:underline">
                العودة للشركاء
              </Link>
            </>
          )}
        </main>
      </div>
    );
  }

  const transactions = allTransactions
    .filter((t) => t.partner_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const balance = computePartnerBalance(id, allTransactions);
  const totalFunded = computePartnerTotalFunded(id, allTransactions);
  const totalAllocated = computePartnerAllocatedCost(id, allTransactions);
  const totalProfit = transactions.reduce((sum, t) => sum + t.profit_amount, 0);
  const availableFunding = Math.round((totalFunded - totalAllocated) * 100) / 100;
  const deals = transactions.filter((t) => t.type === "sale_settlement");

  function productName(productId?: string) {
    return products.find((p) => p.id === productId)?.name ?? "—";
  }

  function dealSource(t: (typeof transactions)[number]) {
    if (t.related_sale_id) {
      const sale = sales.find((s) => s.id === t.related_sale_id);
      return sale
        ? {
            label: sale.invoice_number,
            to: "/sales/$id" as const,
            customerName: sale.customer_name,
            dealValue: sale.total,
          }
        : null;
    }
    if (t.related_contract_id) {
      const contract = contracts.find((c) => c.id === t.related_contract_id);
      return contract
        ? {
            label: contract.contract_number,
            to: "/contracts/$id" as const,
            customerName: contract.customer_name,
            dealValue: contract.cash_subtotal,
          }
        : null;
    }
    return null;
  }

  function handleConfirmAction() {
    setActionError(null);
    const amount = Number(actionAmount);
    if (!actionAmount || amount <= 0) {
      setActionError("أدخل مبلغ صحيح");
      return;
    }
    const onSettled = {
      onSuccess: () => {
        setActionAmount("");
        setActionSuccess(true);
        setTimeout(() => setActionSuccess(false), 2000);
      },
      onError: (e: unknown) => setActionError(e instanceof Error ? e.message : "حدث خطأ"),
    };
    if (actionMode === "funding") {
      addFundingMutation.mutate({ partnerId: id, amount, actorUserId }, onSettled);
    } else {
      withdrawMutation.mutate({ partnerId: id, amount, actorUserId }, onSettled);
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <Link to="/partners" className="text-xs text-muted-foreground hover:underline">
          ← كل الشركاء
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{partner.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              {partner.code} {partner.phone ? `· ${partner.phone}` : ""} · نسبة الربح{" "}
              {partner.profit_share_pct}% · انضم في{" "}
              {new Date(partner.created_at).toLocaleDateString("ar-EG")}
            </p>
          </div>
        </div>

        {partner.notes && <p className="mt-3 text-sm text-muted-foreground">{partner.notes}</p>}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">دفع كام (إجمالي التمويل)</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {totalFunded.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">اتخصم منه (مخصص لصفقات)</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {totalAllocated.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">متاح غير مخصص بعد</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {availableFunding.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">هيكسب (إجمالي الأرباح)</p>
            <p className="mt-1 text-2xl font-bold text-success" dir="ltr">
              {totalProfit.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
            <p className="text-xs text-muted-foreground">رصيده الحالي (بعد الربح)</p>
            <p className="mt-1 text-2xl font-bold text-primary" dir="ltr">
              {balance.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">عدد الصفقات</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {deals.length}
            </p>
          </div>
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">تمويل / سحب</h2>
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <div className="flex overflow-hidden rounded-md border border-input text-sm">
              <button
                type="button"
                onClick={() => setActionMode("funding")}
                className={`px-3 py-2 font-medium ${
                  actionMode === "funding"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                إضافة تمويل
              </button>
              <button
                type="button"
                onClick={() => setActionMode("withdrawal")}
                className={`px-3 py-2 font-medium ${
                  actionMode === "withdrawal"
                    ? "bg-primary text-primary-foreground"
                    : "text-foreground hover:bg-accent"
                }`}
              >
                سحب من رصيده
              </button>
            </div>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">المبلغ</span>
              <input
                type="number"
                min="0"
                value={actionAmount}
                onChange={(e) => setActionAmount(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <button
              onClick={handleConfirmAction}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              تأكيد
            </button>
            {actionSuccess && <span className="text-sm text-success">تم ✓</span>}
          </div>
          {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">الصفقات الممولة</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">الجهاز</th>
                  <th className="px-4 py-3 font-medium">العميل / الفاتورة</th>
                  <th className="px-4 py-3 font-medium">قيمة الصفقة</th>
                  <th className="px-4 py-3 font-medium">اتخصم منه (تكلفته)</th>
                  <th className="px-4 py-3 font-medium">هيكسب (ربحه)</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((t) => {
                  const source = dealSource(t);
                  return (
                    <tr key={t.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {productName(t.related_product_id)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {source ? (
                          <>
                            {source.customerName} —{" "}
                            <Link
                              to={source.to}
                              params={{
                                id: (t.related_sale_id ?? t.related_contract_id) as string,
                              }}
                              className="text-primary hover:underline"
                              dir="ltr"
                            >
                              {source.label}
                            </Link>
                          </>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {source ? `${source.dealValue.toLocaleString("ar-EG")} ج.م` : "—"}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {t.cost_recovered.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 font-medium text-success" dir="ltr">
                        {t.profit_amount.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {new Date(t.created_at).toLocaleDateString("ar-EG")}
                      </td>
                    </tr>
                  );
                })}
                {deals.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد صفقات ممولة بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">سجل الحركة الكامل</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">السبب/المرجع</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 text-muted-foreground">
                      {TYPE_LABEL[t.type] ?? t.type}
                    </td>
                    <td
                      className={`px-4 py-3 font-medium ${t.amount >= 0 ? "text-foreground" : "text-destructive"}`}
                      dir="ltr"
                    >
                      {t.amount >= 0 ? "" : "-"}
                      {Math.abs(t.amount).toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {t.reference ?? t.reason ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(t.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {transactions.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد حركة لهذا الشريك بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
