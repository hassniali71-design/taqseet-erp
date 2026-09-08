import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  closeShift,
  getAccountBalance,
  getShifts,
  getTreasuryAccounts,
  getTreasuryMovements,
  openShift,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { TreasuryMovement } from "@/types";

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

function TreasuryPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [openingBalance, setOpeningBalance] = useState("0");
  const [countedAmount, setCountedAmount] = useState("");
  const [closeReason, setCloseReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const accounts = getTreasuryAccounts(session.tenant_id).filter((a) => a.active);
  const cashierAccount = accounts.find((a) => a.kind === "cashier");
  const openShiftRow = cashierAccount
    ? getShifts(session.tenant_id).find(
        (s) => s.account_id === cashierAccount.id && s.status === "open",
      )
    : undefined;
  const closedShifts = getShifts(session.tenant_id)
    .filter((s) => s.status === "closed")
    .sort((a, b) => (b.closed_at ?? "").localeCompare(a.closed_at ?? ""));

  const movements = getTreasuryMovements(session.tenant_id).sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  );
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
    try {
      openShift(cashierAccount.id, Number(openingBalance) || 0, actorUserId);
      setOpeningBalance("0");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  function handleCloseShift() {
    setError(null);
    if (!openShiftRow) return;
    const counted = Number(countedAmount);
    if (!countedAmount || counted < 0) {
      setError("أدخل المبلغ المعدود فعليًا");
      return;
    }
    try {
      closeShift(openShiftRow.id, counted, closeReason, actorUserId);
      setCountedAmount("");
      setCloseReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">الخزينة</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §68 — الرصيد هنا محسوب دائمًا من مجموع الحركات، مش رقم مخزّن لوحده. §70 وردية الكاشير لازم
          سبب موثّق لأي فرق عند الإقفال.
        </p>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {accounts.map((account) => (
            <div key={account.id} className="rounded-xl border border-border bg-card p-4">
              <p className="text-xs text-muted-foreground">{account.name}</p>
              <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
                {getAccountBalance(account.id).toLocaleString("ar-EG")} ج.م
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
                  <button
                    onClick={handleCloseShift}
                    className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                  >
                    إقفال الوردية
                  </button>
                </div>
              </div>
            )}
          </section>
        )}

        {closedShifts.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">سجل الورديات المقفلة</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
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
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
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
