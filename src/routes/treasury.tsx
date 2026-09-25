import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowDownCircle, ArrowUpCircle, Wallet } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { LabeledValue } from "@/components/ui/LabeledValue";
import { StatCard } from "@/components/ui/StatCard";
import { TreasuryGuide } from "@/components/ui/TreasuryGuide";
import { subscribeData } from "@/lib/data-store";
import { matchesSearch } from "@/lib/text-filter";
import {
  computeAccountBalance,
  useCloseShift,
  useCreateTreasuryAccount,
  useInstallmentContracts,
  useJournalEntries,
  useMarkShiftReviewed,
  useOpenShift,
  usePartnerTransactions,
  useSales,
  useShifts,
  useTreasuryAccounts,
  useTreasuryMovements,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";
import type { TreasuryAccount, TreasuryMovement } from "@/types";

export const Route = createFileRoute("/treasury")({
  component: TreasuryPage,
});

const MOVEMENT_TYPE_LABELS: Record<TreasuryMovement["type"], string> = {
  opening: "رصيد افتتاحي",
  sale: "بيع",
  collection: "تحصيل",
  purchase_payment: "دفعة لمورد",
  expense: "مصروف",
  return: "مرتجع",
  exchange: "استبدال",
  transfer: "تحويل بين خزائن (تسليم وردية)",
  partner_profit_payout: "صرف أرباح لشريك",
};

function isToday(isoDate: string): boolean {
  const d = new Date(isoDate);
  const now = new Date();
  return (
    d.getFullYear() === now.getFullYear() &&
    d.getMonth() === now.getMonth() &&
    d.getDate() === now.getDate()
  );
}

const ACCOUNT_KIND_LABELS: Record<TreasuryAccount["kind"], string> = {
  main: "خزينة رئيسية",
  cashier: "كاشير",
  bank: "بنك",
  wallet: "محفظة إلكترونية",
};

const DISCREPANCY_REASON_PRESETS = [
  "مصروف غير مسجَّل",
  "بضاعة مفقودة",
  "نقص تحصيل",
  "سبب آخر",
] as const;

function TreasuryPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [countedAmount, setCountedAmount] = useState("");
  const [closeReasonPreset, setCloseReasonPreset] = useState<string>(DISCREPANCY_REASON_PRESETS[0]);
  const [closeReasonOther, setCloseReasonOther] = useState("");
  const [destinationAccountId, setDestinationAccountId] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountKind, setNewAccountKind] = useState<TreasuryAccount["kind"]>("cashier");
  const [newAccountOpeningBalance, setNewAccountOpeningBalance] = useState("");
  const [movementSearch, setMovementSearch] = useState("");

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: allAccounts = [] } = useTreasuryAccounts(session?.tenant_id);
  const { data: allMovements = [] } = useTreasuryMovements(session?.tenant_id);
  const { data: allShifts = [] } = useShifts(session?.tenant_id);
  const { data: allSales = [] } = useSales(session?.tenant_id);
  const { data: allContracts = [] } = useInstallmentContracts(session?.tenant_id);
  const { data: allJournalEntries = [] } = useJournalEntries(session?.tenant_id);
  const { data: allPartnerTransactions = [] } = usePartnerTransactions(session?.tenant_id);
  const createAccountMutation = useCreateTreasuryAccount(session?.tenant_id);
  const openShiftMutation = useOpenShift(session?.tenant_id);
  const closeShiftMutation = useCloseShift(session?.tenant_id);
  const markReviewedMutation = useMarkShiftReviewed(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  const accounts = allAccounts.filter((a) => a.active);
  const cashierAccount = accounts.find((a) => a.kind === "cashier");
  const openShiftRow = cashierAccount
    ? allShifts.find((s) => s.account_id === cashierAccount.id && s.status === "open")
    : undefined;
  const closedShifts = allShifts
    .filter((s) => s.status === "closed")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

  const movements = [...allMovements].sort((a, b) => b.created_at.localeCompare(a.created_at));

  function handleCreateAccount(event: FormEvent) {
    event.preventDefault();
    if (!newAccountName.trim()) return;
    createAccountMutation.mutate(
      {
        name: newAccountName.trim(),
        kind: newAccountKind,
        actorUserId,
        openingBalance: Number(newAccountOpeningBalance) || 0,
      },
      {
        onSuccess: () => {
          setNewAccountName("");
          setNewAccountOpeningBalance("");
          setShowAccountForm(false);
        },
      },
    );
  }
  const todayMovements = movements.filter((m) => isToday(m.created_at));
  const todaySales = todayMovements
    .filter((m) => m.type === "sale")
    .reduce((sum, m) => sum + m.amount, 0);
  const todayCollections = todayMovements
    .filter((m) => m.type === "collection")
    .reduce((sum, m) => sum + m.amount, 0);
  const todayPurchasePayments = todayMovements
    .filter((m) => m.type === "purchase_payment")
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const todayExpenses = todayMovements
    .filter((m) => m.type === "expense")
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const todayNet = todayMovements.reduce((sum, m) => sum + m.amount, 0);

  function handleOpenShift() {
    setError(null);
    if (!cashierAccount) return;
    openShiftMutation.mutate(
      { accountId: cashierAccount.id, openingBalance: Number(openingBalance) || 0, actorUserId },
      {
        onSuccess: () => setOpeningBalance("0"),
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  function handleCloseShift() {
    setError(null);
    if (!openShiftRow || !cashierAccount) return;
    const counted = Number(countedAmount);
    if (!countedAmount || counted < 0) {
      setError("أدخل المبلغ المعدود فعليًا");
      return;
    }
    // اختيار بسيط: يا إما المبلغ المعدود كله يفضل في الكاشير (مفيش تحويل)، يا إما يتحوّل
    // كامل لخزينة تانية واحدة اخترتها — مش توزيع معقّد على عدة خزائن بأرقام منفصلة.
    const allocations = destinationAccountId
      ? [{ accountId: destinationAccountId, amount: counted }]
      : [];
    const combinedReason =
      closeReasonPreset === "سبب آخر" ? closeReasonOther.trim() : closeReasonPreset;
    closeShiftMutation.mutate(
      {
        shiftId: openShiftRow.id,
        countedAmount: counted,
        reason: combinedReason,
        actorUserId,
        allocations,
      },
      {
        onSuccess: () => {
          setCountedAmount("");
          setCloseReasonPreset(DISCREPANCY_REASON_PRESETS[0]);
          setCloseReasonOther("");
          setDestinationAccountId("");
        },
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  function handleMarkReviewed(shiftId: string) {
    markReviewedMutation.mutate({ shiftId, actorUserId });
  }

  const otherAccounts = accounts.filter((a) => a.id !== cashierAccount?.id);

  // تفصيل "المتوقع" قبل ما تدخل المبلغ المعدود — بدل رقم واحد مجرد، هتشوف الرصيد الافتتاحي
  // + كل حركة اتسجلت على الكاشير من وقت الفتح، مقسّمة حسب نوعها.
  const movementsSinceOpen =
    openShiftRow && cashierAccount
      ? allMovements.filter(
          (m) => m.account_id === cashierAccount.id && m.created_at >= openShiftRow.opened_at,
        )
      : [];
  const movementsByType = new Map<string, number>();
  for (const m of movementsSinceOpen) {
    movementsByType.set(m.type, (movementsByType.get(m.type) ?? 0) + m.amount);
  }
  const expectedNow =
    openShiftRow && cashierAccount
      ? Math.round(
          ((openShiftRow.opening_balance ?? 0) +
            movementsSinceOpen.reduce((sum, m) => sum + m.amount, 0)) *
            100,
        ) / 100
      : 0;

  // ورديات مقفلة بفرق ≠ صفر ولسه محتاجة مراجعة — كارت تنبيه دائم يفضل ظاهر لحد ما حد يراجعها.
  const shiftsNeedingReview = closedShifts.filter(
    (s) => (s.closing_diff ?? 0) !== 0 && !s.reviewed_at,
  );

  // نظرة عامة سهلة وسلسة — بدل ما صاحب المحل يفهم الخزينة من جدول حركات مفصّل، 4 أرقام
  // واضحة بلغته هو: الشركاء ضخوا كام، بعنا بكام، صرفنا كام، وكسبنا كام. الربح هنا نفسه
  // المصدر المحاسبي الموحّد (إيراد 3000+3100 ناقص مصروفات 5000) اللي التقرير المالي
  // بيستخدمه — مفيش منطق مالي موازي جديد.
  const totalPartnerFunding = allPartnerTransactions
    .filter((t) => t.type === "funding")
    .reduce((sum, t) => sum + t.amount, 0);
  const totalSold =
    allSales.filter((s) => s.status === "completed").reduce((sum, s) => sum + (s.total ?? 0), 0) +
    allContracts.reduce((sum, c) => sum + (c.total_amount ?? 0), 0);
  const totalSpent = allMovements
    .filter((m) => m.type === "purchase_payment" || m.type === "expense")
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const byAccountAllTime = new Map<string, { debit: number; credit: number }>();
  for (const entry of allJournalEntries) {
    for (const line of entry.lines ?? []) {
      const current = byAccountAllTime.get(line.account_code) ?? { debit: 0, credit: 0 };
      current.debit += line.debit ?? 0;
      current.credit += line.credit ?? 0;
      byAccountAllTime.set(line.account_code, current);
    }
  }
  const totalEarned =
    (byAccountAllTime.get("3000")?.credit ?? 0) +
    (byAccountAllTime.get("3100")?.credit ?? 0) -
    (byAccountAllTime.get("5000")?.debit ?? 0);
  const currentTreasuryBalance = accounts.reduce(
    (sum, a) => sum + computeAccountBalance(a.id, allMovements),
    0,
  );
  // مُشتقّة من نفس movements المجلوبة بالفعل — صفر استعلام جديد وصفر منطق مالي جديد، مجرد
  // تجميع عرضي زي totalSpent تحت. الإشارة في amount نفسها هي مصدر الحقيقة (موجب=دخول،
  // سالب=خروج)، فمفيش داعي لجدول اتجاه لكل نوع حركة. مقصورة على حركات الخزائن النشطة فقط
  // (نفس نطاق currentTreasuryBalance بالظبط) — عشان "الداخل − الخارج = الرصيد الحالي" يفضل
  // صحيح حسابيًا حتى لو فيه خزينة اتوقفت وليها تاريخ حركات قديم.
  const activeAccountIds = new Set(accounts.map((a) => a.id));
  const activeMovements = allMovements.filter((m) => activeAccountIds.has(m.account_id));
  const totalInflow = activeMovements
    .filter((m) => m.amount > 0)
    .reduce((sum, m) => sum + m.amount, 0);
  const totalOutflow = activeMovements
    .filter((m) => m.amount < 0)
    .reduce((sum, m) => sum + Math.abs(m.amount), 0);
  const netMovement = Math.round((totalInflow - totalOutflow) * 100) / 100;
  // أرصدة الشركاء الفعلية (مش بس التمويل) — مجموع كل amount في دفترهم عبر كل الأنواع
  // (تمويل/سحب/تسوية صفقة/صرف أرباح/نصيب مصروف)، بالظبط زي computePartnerBalance لكل شريك
  // على حدة، مجمّعة هنا لكل الشركاء مع بعض. معلومة بس — لا تُستخدم في أي منطق مالي، فقط
  // للكارت الإعلامي "الإجمالي الكلي" تحت (قرار المستخدم: الدفترين يفضلوا منفصلين فعليًا).
  const totalPartnersBalance = allPartnerTransactions.reduce((sum, t) => sum + t.amount, 0);
  const combinedTotal = Math.round((currentTreasuryBalance + totalPartnersBalance) * 100) / 100;
  // اللي اتصرف فعليًا من فلوس الشركاء (مش من الخزينة) — تكلفة الأجهزة اللي شركاء موّلوها وقت
  // البيع (cost_recovered لصفوف sale_settlement) + نصيبهم من مصروفات محمَّلة عليهم
  // (expense_share). معلومة بس، قراءة من دفتر الشركاء الموجود — صفر تأثير على أي حركة خزينة
  // أو رصيد حقيقي، عشان الدفتران يفضلوا منفصلين فعليًا (قرار المستخدم).
  const totalSpentViaPartners =
    Math.round(
      (allPartnerTransactions
        .filter((t) => t.type === "sale_settlement")
        .reduce((sum, t) => sum + t.cost_recovered, 0) +
        allPartnerTransactions
          .filter((t) => t.type === "expense_share")
          .reduce((sum, t) => sum + Math.abs(t.amount), 0)) *
        100,
    ) / 100;

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">الخزينة</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              الرصيد محسوب دائمًا من مجموع الحركات الفعلية، مش رقم مخزّن لوحده.
            </p>
          </div>
          {!showAccountForm && (
            <button
              onClick={() => setShowAccountForm(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة خزينة
            </button>
          )}
        </div>

        {showAccountForm && (
          <form
            onSubmit={handleCreateAccount}
            className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">الاسم *</span>
              <input
                required
                value={newAccountName}
                onChange={(e) => setNewAccountName(e.target.value)}
                className="form-input"
                placeholder="الخزينة الرئيسية"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">النوع</span>
              <select
                value={newAccountKind}
                onChange={(e) => setNewAccountKind(e.target.value as TreasuryAccount["kind"])}
                className="form-input"
              >
                {(Object.keys(ACCOUNT_KIND_LABELS) as TreasuryAccount["kind"][]).map((kind) => (
                  <option key={kind} value={kind}>
                    {ACCOUNT_KIND_LABELS[kind]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">رصيد افتتاحي (اختياري)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={newAccountOpeningBalance}
                onChange={(e) => setNewAccountOpeningBalance(e.target.value)}
                className="form-input"
                placeholder="0"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              حفظ
            </button>
            <button
              type="button"
              onClick={() => setShowAccountForm(false)}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              إلغاء
            </button>
          </form>
        )}

        {accounts.length === 0 && !showAccountForm && (
          <p className="mt-4 text-sm text-muted-foreground">
            لا توجد خزينة بعد — أضف خزينة كاشير علشان تقدر تفتح وردية، وخزينة رئيسية لدفعات
            الموردين.
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard
            label="رصيد الخزينة الآن"
            value={`${currentTreasuryBalance.toLocaleString("ar-EG")} ج.م`}
            valueDir="ltr"
            tone="primary"
            icon={Wallet}
          />
          <StatCard
            label="إجمالي الداخل (كل الأوقات)"
            value={`${totalInflow.toLocaleString("ar-EG")} ج.م`}
            valueDir="ltr"
            tone="success"
            icon={ArrowUpCircle}
          />
          <StatCard
            label="إجمالي الخارج (كل الأوقات)"
            value={`${totalOutflow.toLocaleString("ar-EG")} ج.م`}
            valueDir="ltr"
            tone="danger"
            icon={ArrowDownCircle}
          />
          <StatCard
            label="صافي الحركة"
            value={`${netMovement.toLocaleString("ar-EG")} ج.م`}
            valueDir="ltr"
            tone={netMovement >= 0 ? "success" : "danger"}
            icon={netMovement >= 0 ? ArrowUpCircle : ArrowDownCircle}
            sub="الداخل − الخارج = الرصيد الحالي"
          />
        </div>

        <div className="mt-6">
          <TreasuryGuide />
        </div>

        <section className="mt-6">
          <h2 className="text-sm font-bold text-foreground">نظرة عامة (كل الأوقات)</h2>
          <div className="mt-3 rounded-xl border-2 border-dashed border-muted-foreground/40 bg-muted/30 p-4">
            <p className="text-xs font-bold text-muted-foreground">
              الإجمالي الكلي (شركاء + خزينة) — للمعرفة بس
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {combinedTotal.toLocaleString("ar-EG")} ج.م
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              ده رقم إعلامي فقط بيجمع رصيد الشركاء ({totalPartnersBalance.toLocaleString("ar-EG")}{" "}
              ج.م) مع رصيد الخزينة ({currentTreasuryBalance.toLocaleString("ar-EG")} ج.م) — الدفترين
              منفصلين تمامًا فعليًا، مش رصيد واحد تقدر تصرف منه مباشرة.
            </p>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-4 sm:grid-cols-3">
            <Link to="/partners" className="block">
              <StatCard
                label="إجمالي تمويل الشركاء"
                value={`${totalPartnerFunding.toLocaleString("ar-EG")} ج.م`}
                valueDir="ltr"
                sub="فتح صفحة الشركاء ←"
              />
            </Link>
            <StatCard
              label="بعنا بكام (كاش + تقسيط)"
              value={`${totalSold.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
            />
            <StatCard
              label="صرفنا كام من الخزينة (موردين + مصروفات)"
              value={`${totalSpent.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
              tone="danger"
            />
            <StatCard
              label="منصرف عن طريق الشركاء (مش من الخزينة)"
              value={`${totalSpentViaPartners.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
              sub="تكلفة أجهزة ومصروفات موّلها شركاء — من دفترهم، مش من الخزينة"
            />
            <StatCard
              label="كسبنا كام (صافي الربح)"
              value={`${totalEarned.toLocaleString("ar-EG")} ج.م`}
              valueDir="ltr"
              tone="success"
            />
          </div>
        </section>

        {accounts.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-bold text-foreground">أرصدة الحسابات</h2>
            <div className="mt-3 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {accounts.map((account) => (
                <LabeledValue
                  key={account.id}
                  label={`${account.name} (${ACCOUNT_KIND_LABELS[account.kind]})`}
                  value={`${computeAccountBalance(account.id, allMovements).toLocaleString("ar-EG")} ج.م`}
                  valueDir="ltr"
                />
              ))}
            </div>
          </section>
        )}

        <section className="mt-8 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">الإقفال اليومي (عرض فقط)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="مبيعات اليوم" value={todaySales} direction="in" />
            <Stat label="تحصيلات اليوم" value={todayCollections} direction="in" />
            <Stat label="دفعات موردين" value={-todayPurchasePayments} direction="out" />
            <Stat label="مصروفات اليوم" value={-todayExpenses} direction="out" />
            <Stat label="الصافي" value={todayNet} direction="auto" />
          </div>
        </section>

        {cashierAccount && (
          <section className="mt-8 rounded-2xl border-2 border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">وردية الكاشير</h2>
            {error && <p className="mt-2 text-sm text-destructive">{error}</p>}

            {!openShiftRow ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الرصيد الافتتاحي</span>
                  <input
                    type="number"
                    min="0"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                <button
                  onClick={handleOpenShift}
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  فتح وردية
                </button>
              </div>
            ) : (
              <div className="mt-3">
                <p className="text-xs text-muted-foreground">
                  مفتوحة منذ {new Date(openShiftRow.opened_at).toLocaleString("ar-EG")} — رصيد
                  افتتاحي {openShiftRow.opening_balance.toLocaleString("ar-EG")} ج.م
                </p>

                <div className="mt-3 rounded-lg border border-border bg-muted/30 p-3">
                  <p className="text-xs font-bold text-foreground">
                    المتوقع دلوقتي: {expectedNow.toLocaleString("ar-EG")} ج.م
                  </p>
                  {movementsSinceOpen.length > 0 ? (
                    <ul className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-muted-foreground sm:grid-cols-4">
                      {[...movementsByType.entries()].map(([type, sum]) => (
                        <li key={type} className="flex justify-between gap-2" dir="ltr">
                          <span>
                            {MOVEMENT_TYPE_LABELS[type as TreasuryMovement["type"]] ?? type}
                          </span>
                          <span className={sum >= 0 ? "text-success" : "text-destructive"}>
                            {sum >= 0 ? "+" : ""}
                            {sum.toLocaleString("ar-EG")}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      مفيش أي حركة اتسجلت على الكاشير من وقت الفتح لحد دلوقتي.
                    </p>
                  )}
                </div>

                <div className="mt-3 flex flex-wrap items-end gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">
                      المبلغ المعدود فعليًا
                    </span>
                    <input
                      type="number"
                      min="0"
                      value={countedAmount}
                      onChange={(e) => setCountedAmount(e.target.value)}
                      className="form-input"
                      dir="ltr"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs font-medium text-foreground">سبب الفرق (لو فيه)</span>
                    <select
                      value={closeReasonPreset}
                      onChange={(e) => setCloseReasonPreset(e.target.value)}
                      className="form-input"
                    >
                      {DISCREPANCY_REASON_PRESETS.map((preset) => (
                        <option key={preset} value={preset}>
                          {preset}
                        </option>
                      ))}
                    </select>
                  </label>
                  {closeReasonPreset === "سبب آخر" && (
                    <label className="block flex-1 space-y-1">
                      <span className="text-xs font-medium text-foreground">تفاصيل السبب</span>
                      <input
                        value={closeReasonOther}
                        onChange={(e) => setCloseReasonOther(e.target.value)}
                        className="form-input"
                      />
                    </label>
                  )}
                </div>

                {otherAccounts.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border p-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-bold text-foreground">
                        فين حط المبلغ المعدود ده؟
                      </span>
                      <select
                        value={destinationAccountId}
                        onChange={(e) => setDestinationAccountId(e.target.value)}
                        className="form-input"
                      >
                        <option value="">يفضل كاش في الكاشير (مفيش تحويل)</option>
                        {otherAccounts.map((account) => (
                          <option key={account.id} value={account.id}>
                            حوّل الكل لـ{account.name} ({ACCOUNT_KIND_LABELS[account.kind]})
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="mt-2 text-[11px] text-muted-foreground">
                      اختياري — لو مش هتحوّل الفلوس دلوقتي سيبها "يفضل في الكاشير"، وحوّلها بعدين
                      وقت ما تحتاج.
                    </p>
                  </div>
                )}

                <button
                  onClick={handleCloseShift}
                  className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  إقفال الوردية
                </button>
              </div>
            )}
          </section>
        )}

        {shiftsNeedingReview.length > 0 && (
          <section className="mt-8 space-y-3">
            <h2 className="text-lg font-bold text-destructive">
              ورديات فيها فرق محتاجة مراجعة ({shiftsNeedingReview.length})
            </h2>
            {shiftsNeedingReview.map((shift) => (
              <div
                key={shift.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border-2 border-destructive/40 bg-destructive/5 p-4"
              >
                <div>
                  <p className="text-sm font-bold text-foreground" dir="ltr">
                    فرق {shift.closing_diff?.toLocaleString("ar-EG")} ج.م — وردية اتقفلت بتاريخ{" "}
                    {shift.closed_at && new Date(shift.closed_at).toLocaleString("ar-EG")}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    السبب المسجَّل: {shift.closing_reason ?? "—"}
                  </p>
                </div>
                <button
                  onClick={() => handleMarkReviewed(shift.id)}
                  className="whitespace-nowrap rounded-md border border-input bg-card px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  راجعتها ✓
                </button>
              </div>
            ))}
          </section>
        )}

        {closedShifts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">سجل الورديات المقفلة</h2>
            <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">الافتتاحي</th>
                    <th className="px-4 py-3 font-medium">المتوقع</th>
                    <th className="px-4 py-3 font-medium">الفعلي</th>
                    <th className="px-4 py-3 font-medium">الفرق</th>
                    <th className="px-4 py-3 font-medium">السبب</th>
                    <th className="px-4 py-3 font-medium">تاريخ الإقفال</th>
                  </tr>
                </thead>
                <tbody>
                  {closedShifts.map((shift) => (
                    <tr key={shift.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {shift.opening_balance.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {shift.closing_expected_amount?.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {shift.closing_counted_amount?.toLocaleString("ar-EG")}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${
                          (shift.closing_diff ?? 0) === 0 ? "text-success" : "text-destructive"
                        }`}
                        dir="ltr"
                      >
                        {shift.closing_diff?.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {shift.closing_reason ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {shift.closed_at && new Date(shift.closed_at).toLocaleString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">سجل حركة الخزينة</h2>
          <input
            value={movementSearch}
            onChange={(e) => setMovementSearch(e.target.value)}
            placeholder="بحث بالنوع أو المرجع..."
            className="form-input mt-3"
          />
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">النوع</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">المرجع</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {movements
                  .filter((m) =>
                    matchesSearch(
                      movementSearch,
                      MOVEMENT_TYPE_LABELS[m.type],
                      m.reference,
                      m.reason,
                    ),
                  )
                  .map((m) => (
                    <tr key={m.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground">
                        {MOVEMENT_TYPE_LABELS[m.type]}
                      </td>
                      <td
                        className={`px-4 py-3 font-medium ${m.amount >= 0 ? "text-success" : "text-destructive"}`}
                        dir="ltr"
                      >
                        {m.amount >= 0 ? "+" : ""}
                        {m.amount.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {m.reference ?? m.reason ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {new Date(m.created_at).toLocaleString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                {movements.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد حركات بعد.
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

/** `direction="in"/"out"` للمؤشرات اللي اتجاهها ثابت (مبيعات دايمًا دخول، دفعات موردين دايمًا
 * خروج). `"auto"` للصافي — بيتلوّن حسب إشارة القيمة نفسها، مش لون ثابت. */
function Stat({
  label,
  value,
  direction,
}: {
  label: string;
  value: number;
  direction: "in" | "out" | "auto";
}) {
  const isInflow = direction === "auto" ? value >= 0 : direction === "in";
  return (
    <LabeledValue
      label={label}
      value={`${value.toLocaleString("ar-EG")} ج.م`}
      valueDir="ltr"
      tone={isInflow ? "success" : "danger"}
      icon={isInflow ? ArrowUpCircle : ArrowDownCircle}
    />
  );
}
