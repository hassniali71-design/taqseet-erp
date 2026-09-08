import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getCurrentTenantSettings,
  getExpenses,
  getTreasuryAccounts,
  recordExpense,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/expenses")({
  component: ExpensesPage,
});

function ExpensesPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [accountId, setAccountId] = useState("");
  const [category, setCategory] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const settings = getCurrentTenantSettings();
  const accounts = getTreasuryAccounts().filter((a) => a.active);
  const expenses = getExpenses().sort((a, b) => b.created_at.localeCompare(a.created_at));

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    if (!accountId) {
      setError("اختر الخزينة اللي هيتم الصرف منها");
      return;
    }
    try {
      recordExpense(accountId, category, Number(amount) || 0, reason, actorUserId);
      setCategory("");
      setAmount("");
      setReason("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-4xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">المصروفات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §73 — المصروفات فوق {settings.expense_approval_threshold.toLocaleString("ar-EG")} ج.م
          (قابل للتعديل من الإعدادات) بتتعلّم "تحتاج اعتماد" للمراجعة، لكنها لسه بتتسجّل فورًا في
          هذه المرحلة (محرك اعتماد فعلي مؤجّل).
        </p>

        <form
          onSubmit={handleSubmit}
          className="mt-6 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
        >
          <h2 className="text-sm font-bold text-foreground">تسجيل مصروف</h2>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">الخزينة *</span>
              <select
                value={accountId}
                onChange={(e) => setAccountId(e.target.value)}
                className="form-input"
              >
                <option value="">اختر خزينة</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">النوع *</span>
              <input
                required
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="form-input"
                placeholder="إيجار، كهرباء، صيانة..."
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">المبلغ *</span>
              <input
                type="number"
                min="0"
                required
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">السبب *</span>
              <input
                required
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="form-input"
              />
            </label>
          </div>
          <button
            type="submit"
            className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
          >
            تسجيل المصروف
          </button>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </form>

        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">النوع</th>
                <th className="px-4 py-3 font-medium">المبلغ</th>
                <th className="px-4 py-3 font-medium">السبب</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium">التاريخ</th>
              </tr>
            </thead>
            <tbody>
              {expenses.map((expense) => (
                <tr key={expense.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">{expense.category}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {expense.amount.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{expense.reason}</td>
                  <td className="px-4 py-3">
                    {expense.needs_approval ? (
                      <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning">
                        يحتاج اعتماد
                      </span>
                    ) : (
                      <span className="rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success">
                        عادي
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                    {new Date(expense.created_at).toLocaleString("ar-EG")}
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد مصروفات بعد.
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
