import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import { exportPartnerStatementCsv } from "@/lib/partner-export";
import {
  computeAccountBalance,
  computePartnerAllocatedCost,
  computePartnerAvailableProfit,
  computePartnerBalance,
  computePartnerTotalFunded,
  useAddPartnerFunding,
  useInstallmentContracts,
  useInstallments,
  usePartners,
  usePartnerTransactions,
  usePayPartnerProfit,
  useProducts,
  useSales,
  useTreasuryAccounts,
  useTreasuryMovements,
  useWithdrawPartnerFunds,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import type { Installment, InstallmentStatus } from "@/types";

export const Route = createFileRoute("/partners_/$id")({
  component: PartnerDetailPage,
});

const TYPE_LABEL: Record<string, string> = {
  funding: "تمويل",
  withdrawal: "سحب",
  sale_settlement: "تسوية صفقة",
  adjustment: "تسوية يدوية",
  profit_payout: "صرف أرباح",
  expense_share: "نصيب من مصروف",
};

const INSTALLMENT_STATUS_LABEL: Record<InstallmentStatus, string> = {
  scheduled: "قادم",
  due: "مستحق اليوم",
  partially_paid: "مدفوع جزئيًا",
  paid: "مدفوع",
  overdue: "متأخر",
  waived: "معفى",
  rescheduled: "أُعيدت جدولته",
};

const INSTALLMENT_STATUS_CLASS: Record<InstallmentStatus, string> = {
  scheduled: "bg-muted text-muted-foreground",
  due: "bg-warning/15 text-warning",
  partially_paid: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
  waived: "bg-muted text-muted-foreground",
  rescheduled: "bg-muted text-muted-foreground",
};

function PartnerDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [actionMode, setActionMode] = useState<"funding" | "withdrawal" | "profit_payout">(
    "funding",
  );
  const [actionAmount, setActionAmount] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState(false);
  const [expandedDealId, setExpandedDealId] = useState<string | null>(null);
  const [payoutAccountId1, setPayoutAccountId1] = useState("");
  const [payoutAmount1, setPayoutAmount1] = useState("");
  const [showSecondPayoutAccount, setShowSecondPayoutAccount] = useState(false);
  const [payoutAccountId2, setPayoutAccountId2] = useState("");
  const [payoutAmount2, setPayoutAmount2] = useState("");

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: partners = [], isLoading } = usePartners(session?.tenant_id);
  const { data: allTransactions = [] } = usePartnerTransactions(session?.tenant_id);
  const { data: products = [] } = useProducts(session?.tenant_id);
  const { data: sales = [] } = useSales(session?.tenant_id);
  const { data: contracts = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: allInstallments = [] } = useInstallments(session?.tenant_id);
  const { data: allAccounts = [] } = useTreasuryAccounts(session?.tenant_id);
  const { data: allMovements = [] } = useTreasuryMovements(session?.tenant_id);
  const addFundingMutation = useAddPartnerFunding(session?.tenant_id);
  const withdrawMutation = useWithdrawPartnerFunds(session?.tenant_id);
  const payProfitMutation = usePayPartnerProfit(session?.tenant_id);

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
  const availableProfit = computePartnerAvailableProfit(id, allTransactions);
  const activeAccounts = allAccounts.filter((a) => a.active);
  const fundingHistory = transactions.filter((t) =>
    ["funding", "withdrawal", "adjustment"].includes(t.type),
  );
  const profitHistory = transactions.filter((t) =>
    ["sale_settlement", "profit_payout", "expense_share"].includes(t.type),
  );
  const deals = transactions
    .filter((t) => t.type === "sale_settlement")
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const avgProfitPerDeal =
    deals.length > 0 ? Math.round((totalProfit / deals.length) * 100) / 100 : 0;
  const lastDealDate = deals[0]?.created_at;

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
            date: sale.created_at,
            contractId: undefined as string | undefined,
            planLabel: undefined as string | undefined,
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
            date: contract.created_at,
            contractId: contract.id,
            planLabel: `تقسيط ${contract.plan_duration_months} شهر @ ${contract.plan_rate_pct}%`,
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

  function handleConfirmPayout() {
    setActionError(null);
    const amount1 = Number(payoutAmount1);
    if (!payoutAccountId1 || !payoutAmount1 || amount1 <= 0) {
      setActionError("اختر خزينة وأدخل مبلغ صحيح");
      return;
    }
    const allocations = [{ accountId: payoutAccountId1, amount: amount1 }];
    if (showSecondPayoutAccount) {
      const amount2 = Number(payoutAmount2);
      if (!payoutAccountId2 || !payoutAmount2 || amount2 <= 0) {
        setActionError("أدخل بيانات الخزينة الثانية صحيحة");
        return;
      }
      allocations.push({ accountId: payoutAccountId2, amount: amount2 });
    }
    payProfitMutation.mutate(
      { partnerId: id, allocations, actorUserId },
      {
        onSuccess: () => {
          setPayoutAccountId1("");
          setPayoutAmount1("");
          setPayoutAccountId2("");
          setPayoutAmount2("");
          setShowSecondPayoutAccount(false);
          setActionSuccess(true);
          setTimeout(() => setActionSuccess(false), 2000);
        },
        onError: (e) => setActionError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  function handleExport() {
    if (!partner) return;
    const dealRows = deals.map((t) => {
      const source = dealSource(t);
      return {
        date: source?.date
          ? new Date(source.date).toLocaleDateString("ar-EG")
          : new Date(t.created_at).toLocaleDateString("ar-EG"),
        productName: productName(t.related_product_id),
        customerName: source?.customerName ?? "—",
        reference: source?.label ?? "—",
        dealValue: t.deal_value ?? source?.dealValue,
        splitPct: t.split_pct,
        costShare: t.cost_recovered,
        profitSharePct: t.profit_share_pct_snapshot,
        profit: t.profit_amount,
      };
    });
    exportPartnerStatementCsv(
      partner,
      {
        totalFunded,
        totalAllocated,
        availableFunding,
        totalProfit,
        balance,
        dealCount: deals.length,
      },
      dealRows,
      transactions,
    );
  }

  return (
    <div className="flex min-h-screen bg-background">
      <style>{`@media print { .no-print { display: none !important; } }`}</style>
      <div className="no-print">
        <AppSidebar session={session} />
      </div>
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="no-print flex items-center justify-between">
          <Link to="/partners" className="text-xs text-muted-foreground hover:underline">
            ← كل الشركاء
          </Link>
          <div className="flex gap-2">
            <button
              onClick={handleExport}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              تصدير Excel (كشف حساب)
            </button>
            <button
              onClick={() => window.print()}
              className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
            >
              طباعة / تحميل PDF
            </button>
          </div>
        </div>

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

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
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
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">متوسط الربح لكل صفقة</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {avgProfitPerDeal.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">آخر صفقة</p>
            <p className="mt-1 text-lg font-bold text-foreground" dir="ltr">
              {lastDealDate ? new Date(lastDealDate).toLocaleDateString("ar-EG") : "—"}
            </p>
          </div>
        </div>

        <section className="no-print mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">تمويل / سحب / صرف أرباح</h2>
          <div className="mt-3 flex overflow-hidden rounded-md border border-input text-sm">
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
            <button
              type="button"
              onClick={() => setActionMode("profit_payout")}
              className={`px-3 py-2 font-medium ${
                actionMode === "profit_payout"
                  ? "bg-primary text-primary-foreground"
                  : "text-foreground hover:bg-accent"
              }`}
            >
              صرف أرباح
            </button>
          </div>

          {actionMode !== "profit_payout" ? (
            <div className="mt-3 flex flex-wrap items-end gap-3">
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
          ) : (
            <div className="mt-3 space-y-3">
              <p className="text-xs text-muted-foreground">
                الأرباح المتاحة للصرف لهذا الشريك:{" "}
                <span className="font-bold text-success" dir="ltr">
                  {availableProfit.toLocaleString("ar-EG")} ج.م
                </span>{" "}
                — مختلف عن السحب: هنا بيتخصم فعليًا من خزينة حقيقية.
              </p>
              <div className="flex flex-wrap items-end gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الخزينة الأولى</span>
                  <select
                    value={payoutAccountId1}
                    onChange={(e) => setPayoutAccountId1(e.target.value)}
                    className="form-input"
                  >
                    <option value="">اختر خزينة</option>
                    {activeAccounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} (رصيدها{" "}
                        {computeAccountBalance(a.id, allMovements).toLocaleString("ar-EG")})
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">المبلغ منها</span>
                  <input
                    type="number"
                    min="0"
                    value={payoutAmount1}
                    onChange={(e) => setPayoutAmount1(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                {!showSecondPayoutAccount && (
                  <button
                    type="button"
                    onClick={() => setShowSecondPayoutAccount(true)}
                    className="rounded-md border border-input px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    + خزينة تانية (لو رصيد الأولى مش كافي)
                  </button>
                )}
              </div>
              {showSecondPayoutAccount && (
                <div className="flex flex-wrap items-end gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">الخزينة الثانية</span>
                    <select
                      value={payoutAccountId2}
                      onChange={(e) => setPayoutAccountId2(e.target.value)}
                      className="form-input"
                    >
                      <option value="">اختر خزينة</option>
                      {activeAccounts.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name} (رصيدها{" "}
                          {computeAccountBalance(a.id, allMovements).toLocaleString("ar-EG")})
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">المبلغ منها</span>
                    <input
                      type="number"
                      min="0"
                      value={payoutAmount2}
                      onChange={(e) => setPayoutAmount2(e.target.value)}
                      className="form-input"
                      dir="ltr"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      setShowSecondPayoutAccount(false);
                      setPayoutAccountId2("");
                      setPayoutAmount2("");
                    }}
                    className="rounded-md border border-input px-3 py-2 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    إلغاء التقسيم
                  </button>
                </div>
              )}
              <div className="flex items-center gap-3">
                <button
                  onClick={handleConfirmPayout}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  تأكيد الصرف
                </button>
                {actionSuccess && <span className="text-sm text-success">تم ✓</span>}
              </div>
            </div>
          )}
          {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">الصفقات الممولة ({deals.length})</h2>
          <div className="mt-3 max-h-[42rem] space-y-3 overflow-y-auto pr-1">
            {deals.map((t) => {
              const source = dealSource(t);
              const dealValue = t.deal_value ?? source?.dealValue;
              const totalDealCost =
                t.split_pct && t.split_pct > 0
                  ? Math.round((t.cost_recovered / (t.split_pct / 100)) * 100) / 100
                  : undefined;
              const dealInstallments = source?.contractId
                ? allInstallments
                    .filter((i: Installment) => i.contract_id === source.contractId)
                    .sort((a, b) => a.seq - b.seq)
                : [];
              const isExpanded = expandedDealId === t.id;
              return (
                <div key={t.id} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-foreground">
                        {productName(t.related_product_id)}
                        {source?.planLabel && (
                          <span className="mr-2 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
                            {source.planLabel}
                          </span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {source ? (
                          <>
                            العميل: {source.customerName} — بيعت بتاريخ{" "}
                            {new Date(source.date).toLocaleDateString("ar-EG")} —{" "}
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
                          `بتاريخ ${new Date(t.created_at).toLocaleDateString("ar-EG")}`
                        )}
                      </p>
                    </div>
                    {dealInstallments.length > 0 && (
                      <button
                        onClick={() => setExpandedDealId(isExpanded ? null : t.id)}
                        className="no-print whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        {isExpanded
                          ? "إخفاء الأقساط ▲"
                          : `عرض الأقساط (${dealInstallments.length}) ▾`}
                      </button>
                    )}
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 rounded-lg bg-muted/40 p-3 text-xs sm:grid-cols-4">
                    <div>
                      <p className="text-muted-foreground">قيمة الصفقة</p>
                      <p className="mt-0.5 font-bold text-foreground" dir="ltr">
                        {dealValue !== undefined ? `${dealValue.toLocaleString("ar-EG")} ج.م` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">تكلفة الصفقة كاملة (من المخزون)</p>
                      <p className="mt-0.5 font-bold text-foreground" dir="ltr">
                        {totalDealCost !== undefined
                          ? `${totalDealCost.toLocaleString("ar-EG")} ج.م`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">نصيبه من الصفقة</p>
                      <p className="mt-0.5 font-bold text-foreground" dir="ltr">
                        {t.split_pct !== undefined && t.split_pct !== null
                          ? `${t.split_pct.toLocaleString("ar-EG")}%`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">نسبة ربحه من نصيبه</p>
                      <p className="mt-0.5 font-bold text-foreground" dir="ltr">
                        {t.profit_share_pct_snapshot !== undefined &&
                        t.profit_share_pct_snapshot !== null
                          ? `${t.profit_share_pct_snapshot.toLocaleString("ar-EG")}%`
                          : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">اتخصم منه (تكلفته)</p>
                      <p className="mt-0.5 font-bold text-foreground" dir="ltr">
                        {t.cost_recovered.toLocaleString("ar-EG")} ج.م
                      </p>
                    </div>
                    <div className="col-span-2 sm:col-span-1">
                      <p className="text-muted-foreground">ربحه من الصفقة دي</p>
                      <p className="mt-0.5 font-bold text-success" dir="ltr">
                        {t.profit_amount.toLocaleString("ar-EG")} ج.م
                      </p>
                    </div>
                  </div>

                  {isExpanded && dealInstallments.length > 0 && (
                    <div className="mt-3 overflow-x-auto rounded-lg border border-border">
                      <table className="w-full text-right text-xs">
                        <thead className="border-b border-border bg-muted/40 text-muted-foreground">
                          <tr>
                            <th className="px-3 py-2 font-medium">قسط</th>
                            <th className="px-3 py-2 font-medium">تاريخ الاستحقاق</th>
                            <th className="px-3 py-2 font-medium">المبلغ</th>
                            <th className="px-3 py-2 font-medium">المدفوع</th>
                            <th className="px-3 py-2 font-medium">الحالة</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dealInstallments.map((inst) => (
                            <tr key={inst.id} className="border-b border-border last:border-0">
                              <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                                {inst.seq}
                              </td>
                              <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                                {new Date(inst.due_date).toLocaleDateString("ar-EG")}
                              </td>
                              <td className="px-3 py-2 text-foreground" dir="ltr">
                                {inst.amount.toLocaleString("ar-EG")} ج.م
                              </td>
                              <td className="px-3 py-2 text-muted-foreground" dir="ltr">
                                {inst.paid_amount.toLocaleString("ar-EG")} ج.م
                              </td>
                              <td className="px-3 py-2">
                                <span
                                  className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${INSTALLMENT_STATUS_CLASS[inst.status]}`}
                                >
                                  {INSTALLMENT_STATUS_LABEL[inst.status]}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {deals.length === 0 && (
              <p className="rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
                لا يوجد صفقات ممولة بعد.
              </p>
            )}
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">
            التمويل والسحب ({fundingHistory.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            حركة رأس المال — إضافة/سحب تمويل وأي تسوية يدوية. لا تشمل الأرباح (انظر القسم التالي).
          </p>
          {renderTransactionsTable(fundingHistory, "لا يوجد حركة تمويل لهذا الشريك بعد.")}
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">
            الأرباح — مكتسبة ومدفوعة ({profitHistory.length})
          </h2>
          <p className="mt-1 text-xs text-muted-foreground">
            كل صف "تسوية صفقة" هو ربح مكتسب من بيع حقيقي؛ "صرف أرباح" هو خصم فعلي من خزينة حقيقية
            (انظر زر "صرف أرباح" أعلاه) — منفصل تمامًا عن التمويل.
          </p>
          {renderTransactionsTable(profitHistory, "لا يوجد أرباح مسجّلة لهذا الشريك بعد.")}
        </section>
      </main>
    </div>
  );

  function renderTransactionsTable(rows: typeof transactions, emptyLabel: string) {
    return (
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
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3 text-muted-foreground">{TYPE_LABEL[t.type] ?? t.type}</td>
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
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  {emptyLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    );
  }
}
