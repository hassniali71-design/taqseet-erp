import { useState } from "react";

import { DateInput } from "@/components/ui/DateInput";
import { StatCard } from "@/components/ui/StatCard";
import { useOwnerPasswordConfirm } from "@/hooks/use-owner-password-confirm";
import {
  computeCustomerExposure,
  dateInputToTimestamp,
  useInstallmentContracts,
  useInstallmentPayments,
  useInstallments,
  useRewriteInstallmentPayment,
  useSaleReturns,
  useSales,
} from "@/lib/supabase-queries";
import type { Customer, InstallmentPayment } from "@/types";

/** كشف حساب عميل كامل — نفس الكشف اللي كان في /reports، اتنقل هنا عشان يظهر كمان جوه صفحة
 * العميل نفسه، ومعاه تعديل/حذف أي إيصال تحصيل (بند 69). التعديل/الحذف بيمرّ على باسورد الأونر
 * + سبب إلزامي، وكل الأرقام (هنا وفي أي صفحة تانية) بتتحسب تاني من الأقساط بعد الحفظ. */
export function CustomerStatement({
  tenantId,
  customer,
  actorUserId,
}: {
  tenantId: string;
  customer: Customer;
  actorUserId: string | null;
}) {
  const { data: allSales = [] } = useSales(tenantId);
  const { data: allContracts = [] } = useInstallmentContracts(tenantId);
  const { data: allInstallments = [] } = useInstallments(tenantId);
  const { data: allPayments = [] } = useInstallmentPayments(tenantId);
  const { data: allReturns = [] } = useSaleReturns(tenantId);
  const rewriteMutation = useRewriteInstallmentPayment(tenantId);
  const { requestConfirm, dialog: passwordDialog } = useOwnerPasswordConfirm();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editAmount, setEditAmount] = useState("");
  const [editDate, setEditDate] = useState("");
  const [editReason, setEditReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const sales = allSales.filter((s) => s.customer_id === customer.id);
  const contracts = allContracts.filter((c) => c.customer_id === customer.id);
  const contractIds = new Set(contracts.map((c) => c.id));
  const payments = allPayments.filter((p) => contractIds.has(p.contract_id));
  const returns = allReturns.filter((r) => r.customer_id === customer.id);

  const totalPurchased =
    sales.reduce((sum, s) => sum + (s.total ?? 0), 0) +
    contracts.reduce((sum, c) => sum + (c.total_amount ?? 0), 0);
  const exposure = computeCustomerExposure(customer.id, allContracts, allInstallments);
  const lastPaymentDate = [...payments].sort((a, b) => b.created_at.localeCompare(a.created_at))[0]
    ?.created_at;

  type Row = {
    key: string;
    date: string;
    label: string;
    amount: number;
    payment?: InstallmentPayment;
  };
  const rows: Row[] = [
    ...sales.map((s) => ({
      key: `s-${s.id}`,
      date: s.created_at,
      label: `فاتورة ${s.invoice_number}`,
      amount: s.total ?? 0,
    })),
    ...contracts.map((c) => ({
      key: `c-${c.id}`,
      date: c.created_at,
      label: `عقد تقسيط ${c.contract_number}`,
      amount: c.total_amount ?? 0,
    })),
    ...payments.map((p) => ({
      key: `p-${p.id}`,
      date: p.created_at,
      label: `تحصيل ${p.receipt_number}`,
      amount: -p.amount,
      payment: p,
    })),
    ...returns.map((r) => ({
      key: `r-${r.id}`,
      date: r.created_at,
      label: `مرتجع ${r.return_number}`,
      amount: -r.refund_amount,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const balance = rows.reduce((sum, r) => sum + r.amount, 0);

  function startEdit(p: InstallmentPayment) {
    setError(null);
    setSuccess(null);
    setEditingId(p.id);
    setEditAmount(String(p.amount));
    setEditDate(p.created_at.slice(0, 10));
    setEditReason("");
  }

  async function saveEdit(p: InstallmentPayment) {
    setError(null);
    const amount = Number(editAmount);
    if (!editAmount || !(amount > 0)) {
      setError("أدخل مبلغ صحيح أكبر من صفر (للحذف استخدم زرار حذف)");
      return;
    }
    if (!editReason.trim()) {
      setError("اكتب سبب التعديل");
      return;
    }
    if (!(await requestConfirm())) return;
    const dateChanged = editDate && editDate !== p.created_at.slice(0, 10);
    try {
      await rewriteMutation.mutateAsync({
        paymentId: p.id,
        newAmount: amount,
        reason: editReason,
        actorUserId,
        ...(dateChanged ? { newCreatedAt: dateInputToTimestamp(editDate) } : {}),
      });
      setEditingId(null);
      setSuccess(`اتعدّل ${p.receipt_number} ✓ وكل الأرقام اتحدّثت`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  async function handleDelete(p: InstallmentPayment) {
    setError(null);
    setSuccess(null);
    const reason = window.prompt(
      `حذف التحصيل ${p.receipt_number} بمبلغ ${p.amount.toLocaleString("ar-EG")} ج.م؟\nالمبلغ هيرجع على العميل تاني، وهيتخصم من الخزينة بحركة عكسية.\n\nاكتب سبب الحذف:`,
    );
    if (reason === null) return;
    if (!reason.trim()) {
      setError("سبب الحذف مطلوب");
      return;
    }
    if (!(await requestConfirm())) return;
    try {
      await rewriteMutation.mutateAsync({ paymentId: p.id, newAmount: 0, reason, actorUserId });
      setSuccess(`اتحذف ${p.receipt_number} ✓ وكل الأرقام اتحدّثت`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="تاريخ الانضمام"
          value={new Date(customer.created_at).toLocaleDateString("ar-EG")}
          valueDir="ltr"
        />
        <StatCard
          label="إجمالي الشراء"
          value={`${totalPurchased.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone="primary"
        />
        <StatCard
          label="المديونية الحالية"
          value={`${exposure.toLocaleString("ar-EG")} ج.م`}
          valueDir="ltr"
          tone={exposure > 0 ? "warning" : "default"}
        />
        <StatCard
          label="آخر تحصيل"
          value={lastPaymentDate ? new Date(lastPaymentDate).toLocaleDateString("ar-EG") : "—"}
          valueDir="ltr"
        />
      </div>
      <p className="mt-4 text-sm text-muted-foreground">
        صافي الحركة (فواتير/عقود مطروحًا منها تحصيلات ومرتجعات):{" "}
        <span className="font-bold text-foreground" dir="ltr">
          {balance.toLocaleString("ar-EG")} ج.م
        </span>
      </p>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {success && <p className="mt-2 text-sm text-success">{success}</p>}
      <div className="mt-3 max-h-[32rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full text-right text-sm">
          <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-3 font-medium">الحركة</th>
              <th className="px-4 py-3 font-medium">المبلغ</th>
              <th className="px-4 py-3 font-medium">التاريخ</th>
              <th className="px-4 py-3 font-medium"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const p = r.payment;
              if (p && editingId === p.id) {
                return (
                  <tr key={r.key} className="border-b border-border bg-primary/5 last:border-0">
                    <td colSpan={4} className="px-4 py-3">
                      <p className="text-xs font-bold text-foreground">تعديل {p.receipt_number}</p>
                      <div className="mt-2 flex flex-wrap items-end gap-2">
                        <label className="block space-y-1">
                          <span className="text-xs text-foreground">المبلغ الصحيح</span>
                          <input
                            type="number"
                            min="0"
                            value={editAmount}
                            onChange={(e) => setEditAmount(e.target.value)}
                            className="form-input w-32"
                            dir="ltr"
                          />
                        </label>
                        <label className="block space-y-1">
                          <span className="text-xs text-foreground">التاريخ</span>
                          <DateInput value={editDate} onChange={setEditDate} className="w-44" />
                        </label>
                        <label className="block flex-1 space-y-1">
                          <span className="text-xs text-foreground">سبب التعديل *</span>
                          <input
                            value={editReason}
                            onChange={(e) => setEditReason(e.target.value)}
                            placeholder="مثلًا: اتكتب 6000 بدل 600"
                            className="form-input"
                          />
                        </label>
                        <button
                          onClick={() => void saveEdit(p)}
                          disabled={rewriteMutation.isPending}
                          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                        >
                          {rewriteMutation.isPending ? "جارٍ الحفظ..." : "حفظ"}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                        >
                          إلغاء
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={r.key} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-foreground">{r.label}</td>
                  <td
                    className={`px-4 py-3 font-medium ${r.amount >= 0 ? "text-foreground" : "text-success"}`}
                    dir="ltr"
                  >
                    {r.amount >= 0 ? "" : "-"}
                    {Math.abs(r.amount).toLocaleString("ar-EG")}
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                    {new Date(r.date).toLocaleDateString("ar-EG")}
                  </td>
                  <td className="whitespace-nowrap px-4 py-3 text-left">
                    {p && (
                      <>
                        <button
                          onClick={() => startEdit(p)}
                          className="ml-3 text-xs font-medium text-primary hover:underline"
                        >
                          تعديل
                        </button>
                        <button
                          onClick={() => void handleDelete(p)}
                          className="text-xs font-medium text-destructive hover:underline"
                        >
                          حذف
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                  لا يوجد حركة لهذا العميل بعد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {passwordDialog}
    </>
  );
}
