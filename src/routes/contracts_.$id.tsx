import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import {
  collectPayment,
  getCurrentTenantSettings,
  getDaysOverdue,
  getEffectiveInstallmentStatus,
  getInstallmentContracts,
  getInstallmentPayments,
  getInstallments,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { InstallmentStatus } from "@/types";

export const Route = createFileRoute("/contracts_/$id")({
  component: ContractDetailPage,
});

const STATUS_LABEL: Record<InstallmentStatus, string> = {
  scheduled: "قادم",
  due: "مستحق",
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

function ContractDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const contract = getInstallmentContracts().find((c) => c.id === id);

  if (!contract) {
    return (
      <div className="min-h-screen bg-background">
        <AppHeader session={session} />
        <main className="mx-auto max-w-3xl px-4 py-8 text-center text-muted-foreground">
          العقد غير موجود.{" "}
          <Link to="/sales/new-installment" className="text-primary hover:underline">
            عقد تقسيط جديد
          </Link>
        </main>
      </div>
    );
  }

  const contractId = contract.id;
  const settings = getCurrentTenantSettings();
  const installments = getInstallments()
    .filter((i) => i.contract_id === contractId)
    .sort((a, b) => a.seq - b.seq);

  const totalPaid = installments.reduce((sum, i) => sum + i.paid_amount, 0);
  const remaining = Math.max(0, contract.total_amount - totalPaid);
  const payments = getInstallmentPayments()
    .filter((p) => p.contract_id === contractId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));

  function handleCollect() {
    setPayError(null);
    const amount = Number(payAmount);
    if (!payAmount || amount <= 0) {
      setPayError("أدخل مبلغ صحيح");
      return;
    }
    try {
      collectPayment(contractId, amount, actorUserId);
      setPayAmount("");
      setPaySuccess(true);
      setTimeout(() => setPaySuccess(false), 2000);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-4xl px-4 py-8">
        <Link to="/customers" className="text-xs text-muted-foreground hover:underline">
          ← كل العملاء
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground" dir="ltr">
              {contract.contract_number}
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">{contract.customer_name}</p>
          </div>
          <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
            {contract.status}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">قيمة البضاعة</p>
            <p className="mt-1 text-lg font-bold text-foreground" dir="ltr">
              {contract.cash_subtotal.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">المقدّم</p>
            <p className="mt-1 text-lg font-bold text-foreground" dir="ltr">
              {contract.down_payment.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              الخطة ({contract.plan_duration_months} شهر @ {contract.plan_rate_pct}%)
            </p>
            <p className="mt-1 text-lg font-bold text-foreground" dir="ltr">
              {contract.total_amount.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">المتبقي</p>
            <p className="mt-1 text-lg font-bold text-foreground" dir="ltr">
              {remaining.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">الأصناف</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">الصنف</th>
                  <th className="px-4 py-3 font-medium">السيريال</th>
                  <th className="px-4 py-3 font-medium">الكمية</th>
                  <th className="px-4 py-3 font-medium">السعر</th>
                </tr>
              </thead>
              <tbody>
                {contract.items.map((item, i) => (
                  <tr key={i} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{item.product_name}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {item.serial_number ?? "—"}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {item.quantity}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {item.unit_price.toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        {remaining > 0 && (
          <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">تسجيل دفعة (§46 أقدم قسط أولًا)</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">
                  المبلغ (المتبقي {remaining.toLocaleString("ar-EG")} ج.م)
                </span>
                <input
                  type="number"
                  min="0"
                  max={remaining}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
              </label>
              <button
                onClick={handleCollect}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تحصيل
              </button>
              {paySuccess && <span className="text-sm text-success">تم التحصيل ✓</span>}
            </div>
            {payError && <p className="mt-2 text-sm text-destructive">{payError}</p>}
          </section>
        )}

        {payments.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">سجل التحصيلات</h2>
            <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="border-b border-border text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">رقم الإيصال</th>
                    <th className="px-4 py-3 font-medium">المبلغ</th>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                  </tr>
                </thead>
                <tbody>
                  {payments.map((payment) => (
                    <tr key={payment.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                        {payment.receipt_number}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {payment.amount.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {new Date(payment.created_at).toLocaleString("ar-EG")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">جدول الأقساط</h2>
          <div className="mt-3 overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">#</th>
                  <th className="px-4 py-3 font-medium">تاريخ الاستحقاق</th>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">المدفوع</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">أيام التأخير</th>
                </tr>
              </thead>
              <tbody>
                {installments.map((installment) => {
                  const effective = getEffectiveInstallmentStatus(
                    installment,
                    settings.grace_period_days,
                  );
                  const daysOverdue = getDaysOverdue(installment);
                  return (
                    <tr key={installment.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {installment.seq}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {new Date(installment.due_date).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                        {installment.amount.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {installment.paid_amount.toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[effective]}`}
                        >
                          {STATUS_LABEL[effective]}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {effective === "overdue" ? daysOverdue : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
