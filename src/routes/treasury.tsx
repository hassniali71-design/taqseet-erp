import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import {
  computeAccountBalance,
  useCloseShift,
  useCreateTreasuryAccount,
  useOpenShift,
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

function TreasuryPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [countedAmount, setCountedAmount] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [allocationAmounts, setAllocationAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [showAccountForm, setShowAccountForm] = useState(false);
  const [newAccountName, setNewAccountName] = useState("");
  const [newAccountKind, setNewAccountKind] = useState<TreasuryAccount["kind"]>("cashier");

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: allAccounts = [] } = useTreasuryAccounts(session?.tenant_id);
  const { data: allMovements = [] } = useTreasuryMovements(session?.tenant_id);
  const { data: allShifts = [] } = useShifts(session?.tenant_id);
  const createAccountMutation = useCreateTreasuryAccount(session?.tenant_id);
  const openShiftMutation = useOpenShift(session?.tenant_id);
  const closeShiftMutation = useCloseShift(session?.tenant_id);

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
      { name: newAccountName.trim(), kind: newAccountKind, actorUserId },
      {
        onSuccess: () => {
          setNewAccountName("");
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
    const allocations = Object.entries(allocationAmounts)
      .map(([accountId, value]) => ({ accountId, amount: Number(value) || 0 }))
      .filter((a) => a.amount > 0);
    closeShiftMutation.mutate(
      {
        shiftId: openShiftRow.id,
        countedAmount: counted,
        reason: closeReason,
        actorUserId,
        allocations,
      },
      {
        onSuccess: () => {
          setCountedAmount("");
          setCloseReason("");
          setAllocationAmounts({});
        },
        onError: (e) => setError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  const otherAccounts = accounts.filter((a) => a.id !== cashierAccount?.id);
  const allocatedTotal = Object.values(allocationAmounts).reduce(
    (sum, v) => sum + (Number(v) || 0),
    0,
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-foreground">الخزينة</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              §68 — الرصيد هنا محسوب دائمًا من مجموع الحركات، مش رقم مخزّن لوحده. §70 وردية الكاشير
              لازم سبب موثّق لأي فرق عند الإقفال.
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

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accounts.length > 0 && (
            <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4 sm:col-span-2">
              <p className="text-xs text-muted-foreground">إجمالي كل الخزائن الآن</p>
              <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
                {accounts
                  .reduce((sum, a) => sum + computeAccountBalance(a.id, allMovements), 0)
                  .toLocaleString("ar-EG")}{" "}
                ج.م
              </p>
            </div>
          )}
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">
                {account.name} ({ACCOUNT_KIND_LABELS[account.kind]})
              </p>
              <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
                {computeAccountBalance(account.id, allMovements).toLocaleString("ar-EG")} ج.م
              </p>
            </div>
          ))}
        </div>

        <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
          <h2 className="text-sm font-bold text-foreground">الإقفال اليومي (§71 — عرض فقط)</h2>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            <Stat label="مبيعات اليوم" value={todaySales} />
            <Stat label="تحصيلات اليوم" value={todayCollections} />
            <Stat label="دفعات موردين" value={-todayPurchasePayments} />
            <Stat label="مصروفات اليوم" value={-todayExpenses} />
            <Stat label="الصافي" value={todayNet} highlight />
          </div>
        </section>

        {cashierAccount && (
          <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">وردية الكاشير (§70)</h2>
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
                  <label className="block flex-1 space-y-1">
                    <span className="text-xs font-medium text-foreground">
                      سبب الفرق (لو فيه فرق)
                    </span>
                    <input
                      value={closeReason}
                      onChange={(e) => setCloseReason(e.target.value)}
                      className="form-input"
                    />
                  </label>
                </div>

                {otherAccounts.length > 0 && (
                  <div className="mt-4 rounded-lg border border-border p-3">
                    <p className="text-xs font-bold text-foreground">
                      توزيع النقدية على الخزائن (اختياري)
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      من المبلغ المعدود فعليًا، حدّد قد إيه هيتسلّم لكل خزينة — مثلاً جزء محفظة
                      إلكترونية، جزء بنك، والباقي يفضل كاش في الكاشير.
                    </p>
                    <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                      {otherAccounts.map((account) => (
                        <label key={account.id} className="block space-y-1">
                          <span className="text-xs font-medium text-foreground">
                            {account.name} ({ACCOUNT_KIND_LABELS[account.kind]})
                          </span>
                          <input
                            type="number"
                            min="0"
                            value={allocationAmounts[account.id] ?? ""}
                            onChange={(e) =>
                              setAllocationAmounts((prev) => ({
                                ...prev,
                                [account.id]: e.target.value,
                              }))
                            }
                            className="form-input"
                            dir="ltr"
                          />
                        </label>
                      ))}
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground" dir="ltr">
                      الموزَّع: {allocatedTotal.toLocaleString("ar-EG")} ج.م — الباقي كاش في
                      الكاشير:{" "}
                      {Math.max(0, (Number(countedAmount) || 0) - allocatedTotal).toLocaleString(
                        "ar-EG",
                      )}{" "}
                      ج.م
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
                {movements.map((m) => (
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

function Stat({ label, value, highlight }: { label: string; value: number; highlight?: boolean }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`mt-1 text-sm font-bold ${highlight ? "text-primary" : "text-foreground"}`}
        dir="ltr"
      >
        {value.toLocaleString("ar-EG")} ج.م
      </p>
    </div>
  );
}
