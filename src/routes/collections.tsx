import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import {
  collectPayment,
  getCurrentTenantSettings,
  getDaysOverdue,
  getEffectiveInstallmentStatus,
  getInstallmentContracts,
  getInstallments,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { Installment, InstallmentStatus } from "@/types";

export const Route = createFileRoute("/collections")({
  component: CollectionsWorkbenchPage,
});

const STATUS_LABEL: Record<InstallmentStatus, string> = {
  scheduled: "قادم",
  due: "مستحق اليوم",
  partially_paid: "مدفوع جزئيًا",
  paid: "مدفوع",
  overdue: "متأخر",
  waived: "معفى",
  rescheduled: "أُعيدت جدولته",
};

const STATUS_CLASS: Record<InstallmentStatus, string> = {
  scheduled: "bg-muted text-muted-foreground",
  due: "bg-warning/15 text-warning",
  partially_paid: "bg-warning/15 text-warning",
  paid: "bg-success/15 text-success",
  overdue: "bg-destructive/15 text-destructive",
  waived: "bg-muted text-muted-foreground",
  rescheduled: "bg-muted text-muted-foreground",
};

type Row = {
  contractId: string;
  contractNumber: string;
  customerName: string;
  outstanding: number;
  nextDue: Installment;
  effectiveStatus: InstallmentStatus;
  daysOverdue: number;
};

function CollectionsWorkbenchPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [filter, setFilter] = useState<"all" | "due" | "overdue">("all");
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const settings = getCurrentTenantSettings();
  const contracts = getInstallmentContracts().filter(
    (c) => c.status !== "settled" && c.status !== "settled_early",
  );
  const allInstallments = getInstallments();

  const rows: Row[] = [];
  for (const contract of contracts) {
    const installments = allInstallments
      .filter(
        (i) => i.contract_id === contract.id && i.status !== "waived" && i.status !== "rescheduled",
      )
      .sort((a, b) => a.seq - b.seq);
    const outstanding =
      Math.round(
        installments.reduce((sum, i) => sum + Math.max(0, i.amount - i.paid_amount), 0) * 100,
      ) / 100;
    if (outstanding <= 0) continue;
    const nextDue = installments.find((i) => i.paid_amount < i.amount);
    if (!nextDue) continue;
    const effectiveStatus = getEffectiveInstallmentStatus(nextDue, settings.grace_period_days);
    rows.push({
      contractId: contract.id,
      contractNumber: contract.contract_number,
      customerName: contract.customer_name,
      outstanding,
      nextDue,
      effectiveStatus,
      daysOverdue: getDaysOverdue(nextDue),
    });
  }

  rows.sort((a, b) => b.daysOverdue - a.daysOverdue);

  const filteredRows = rows.filter((r) => {
    if (filter === "due") return r.effectiveStatus === "due";
    if (filter === "overdue") return r.effectiveStatus === "overdue";
    return true;
  });

  const dueCount = rows.filter((r) => r.effectiveStatus === "due").length;
  const overdueCount = rows.filter((r) => r.effectiveStatus === "overdue").length;

  function handleCollect(contractId: string, contractNumber: string, outstanding: number) {
    setError(null);
    const raw = amounts[contractId];
    const amount = Number(raw);
    if (!raw || amount <= 0) {
      setError("أدخل مبلغ صحيح للتحصيل");
      return;
    }
    if (amount > outstanding) {
      setError(`المبلغ أكبر من المتبقي على العقد (${outstanding} ج.م)`);
      return;
    }
    try {
      const payment = collectPayment(contractId, amount, actorUserId);
      setAmounts((prev) => ({ ...prev, [contractId]: "" }));
      // A page-level message (not a per-row indicator) — a fully-collected overdue/due contract
      // moves out of the current filter tab immediately, which would unmount a per-row "✓" before
      // the user ever sees it.
      setSuccessMessage(
        `تم تحصيل ${amount.toLocaleString("ar-EG")} ج.م لعقد ${contractNumber} — إيصال ${payment.receipt_number}`,
      );
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">مركز التحصيل</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          §52 — التوزيع الافتراضي على أقدم قسط مستحق أولًا (§46). إيصال التحصيل مرقّم تلقائيًا ولا
          يمكن تعديله أو حذفه (§55).
        </p>

        <div className="mt-4 flex flex-wrap gap-2">
          <FilterButton active={filter === "all"} onClick={() => setFilter("all")}>
            الكل ({rows.length})
          </FilterButton>
          <FilterButton active={filter === "due"} onClick={() => setFilter("due")}>
            مستحق اليوم ({dueCount})
          </FilterButton>
          <FilterButton active={filter === "overdue"} onClick={() => setFilter("overdue")}>
            متأخر ({overdueCount})
          </FilterButton>
        </div>

        {error && <p className="mt-3 text-sm text-destructive">{error}</p>}
        {successMessage && <p className="mt-3 text-sm text-success">{successMessage} ✓</p>}

        <div className="mt-4 overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full text-right text-sm">
            <thead className="border-b border-border text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">العقد</th>
                <th className="px-4 py-3 font-medium">العميل</th>
                <th className="px-4 py-3 font-medium">القسط القادم</th>
                <th className="px-4 py-3 font-medium">الحالة</th>
                <th className="px-4 py-3 font-medium">أيام التأخير</th>
                <th className="px-4 py-3 font-medium">إجمالي المتبقي</th>
                <th className="px-4 py-3 font-medium">تحصيل</th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((row) => (
                <tr key={row.contractId} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-foreground">
                    <Link
                      to="/contracts/$id"
                      params={{ id: row.contractId }}
                      className="text-primary hover:underline"
                      dir="ltr"
                    >
                      {row.contractNumber}
                    </Link>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{row.customerName}</td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {row.nextDue.amount.toLocaleString("ar-EG")} ج.م —{" "}
                    {new Date(row.nextDue.due_date).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.effectiveStatus]}`}
                    >
                      {STATUS_LABEL[row.effectiveStatus]}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                    {row.effectiveStatus === "overdue" ? row.daysOverdue : "—"}
                  </td>
                  <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                    {row.outstanding.toLocaleString("ar-EG")} ج.م
                  </td>
                  <td className="whitespace-nowrap px-4 py-3">
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="0"
                        max={row.outstanding}
                        placeholder="المبلغ"
                        value={amounts[row.contractId] ?? ""}
                        onChange={(e) =>
                          setAmounts((prev) => ({ ...prev, [row.contractId]: e.target.value }))
                        }
                        className="form-input w-24"
                        dir="ltr"
                      />
                      <button
                        onClick={() =>
                          handleCollect(row.contractId, row.contractNumber, row.outstanding)
                        }
                        className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                      >
                        تحصيل
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-6 text-center text-muted-foreground">
                    لا يوجد أقساط مطابقة لهذا الفلتر.
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

function FilterButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
        active
          ? "bg-primary text-primary-foreground"
          : "border border-input text-foreground hover:bg-accent"
      }`}
    >
      {children}
    </button>
  );
}
