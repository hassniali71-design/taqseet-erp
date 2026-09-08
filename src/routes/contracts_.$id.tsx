import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  collectPayment,
  earlySettleContract,
  getCurrentTenantSettings,
  getDaysOverdue,
  getEffectiveInstallmentStatus,
  getEffectivePromiseStatus,
  getInstallmentContracts,
  getInstallmentPayments,
  getInstallments,
  getPromisesToPay,
  getRestructureEvents,
  recordPromise,
  restructureContract,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { InstallmentStatus, PromiseToPay } from "@/types";

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

const PROMISE_STATUS_LABEL: Record<PromiseToPay["status"], string> = {
  pending: "قائم",
  kept: "تم الوفاء به",
  failed: "فشل",
};

const PROMISE_STATUS_CLASS: Record<PromiseToPay["status"], string> = {
  pending: "bg-warning/15 text-warning",
  kept: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
};

function ContractDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);
  const [showPromiseForm, setShowPromiseForm] = useState(false);
  const [promiseDate, setPromiseDate] = useState("");
  const [promiseAmount, setPromiseAmount] = useState("");
  const [promiseNotes, setPromiseNotes] = useState("");
  const [promiseError, setPromiseError] = useState<string | null>(null);
  const [showRestructureForm, setShowRestructureForm] = useState(false);
  const [restructureDuration, setRestructureDuration] = useState("6");
  const [restructureReason, setRestructureReason] = useState("");
  const [restructureError, setRestructureError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const contract = getInstallmentContracts(session.tenant_id).find((c) => c.id === id);

  if (!contract) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-3xl px-4 py-8 text-center text-muted-foreground">
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
  const installments = getInstallments(session.tenant_id)
    .filter((i) => i.contract_id === contractId)
    .sort((a, b) => a.seq - b.seq);

  const totalPaid = installments.reduce((sum, i) => sum + i.paid_amount, 0);
  const remaining = Math.max(0, contract.total_amount - totalPaid);
  const payments = getInstallmentPayments(session.tenant_id)
    .filter((p) => p.contract_id === contractId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const promises = getPromisesToPay(session.tenant_id)
    .filter((p) => p.contract_id === contractId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const restructureEvents = getRestructureEvents(session.tenant_id)
    .filter((r) => r.contract_id === contractId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const canAct = contract.status !== "settled" && contract.status !== "settled_early";

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

  function handleAddPromise(event: FormEvent) {
    event.preventDefault();
    setPromiseError(null);
    const amount = Number(promiseAmount);
    if (!promiseDate) {
      setPromiseError("اختر تاريخ الوعد");
      return;
    }
    if (!promiseAmount || amount <= 0) {
      setPromiseError("أدخل مبلغ متوقع صحيح");
      return;
    }
    try {
      recordPromise(
        contractId,
        new Date(promiseDate).toISOString(),
        amount,
        promiseNotes,
        actorUserId,
      );
      setPromiseDate("");
      setPromiseAmount("");
      setPromiseNotes("");
      setShowPromiseForm(false);
    } catch (e) {
      setPromiseError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  function handleEarlySettle() {
    setActionError(null);
    if (
      !window.confirm(`تأكيد تسوية مبكرة لكامل المتبقي (${remaining.toLocaleString("ar-EG")} ج.م)؟`)
    ) {
      return;
    }
    try {
      const payment = earlySettleContract(contractId, actorUserId);
      setActionSuccess(`تمت التسوية المبكرة — إيصال ${payment.receipt_number}`);
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  function handleRestructure(event: FormEvent) {
    event.preventDefault();
    setRestructureError(null);
    const duration = Number(restructureDuration);
    if (!duration || duration <= 0) {
      setRestructureError("أدخل مدة صحيحة بالشهور");
      return;
    }
    if (!restructureReason.trim()) {
      setRestructureError("سبب إعادة الهيكلة مطلوب");
      return;
    }
    try {
      restructureContract(contractId, duration, restructureReason, actorUserId);
      setRestructureReason("");
      setShowRestructureForm(false);
      setActionSuccess("تمت إعادة هيكلة العقد بجدول أقساط جديد");
      setTimeout(() => setActionSuccess(null), 4000);
    } catch (e) {
      setRestructureError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-4xl px-4 py-8">
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
          <div className="flex items-center gap-2">
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground">
              {contract.status}
            </span>
            {canAct && remaining > 0 && (
              <>
                <button
                  onClick={handleEarlySettle}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  تسوية مبكرة
                </button>
                <button
                  onClick={() => setShowRestructureForm((v) => !v)}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  إعادة هيكلة
                </button>
                <button
                  onClick={() => setShowPromiseForm((v) => !v)}
                  className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                >
                  تسجيل وعد بالدفع
                </button>
              </>
            )}
          </div>
        </div>

        {actionError && <p className="mt-2 text-sm text-destructive">{actionError}</p>}
        {actionSuccess && <p className="mt-2 text-sm text-success">{actionSuccess} ✓</p>}

        {showRestructureForm && (
          <form
            onSubmit={handleRestructure}
            className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">المدة الجديدة (بالشهور)</span>
              <input
                type="number"
                min="1"
                required
                value={restructureDuration}
                onChange={(e) => setRestructureDuration(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block flex-1 space-y-1">
              <span className="text-xs font-medium text-foreground">السبب *</span>
              <input
                required
                value={restructureReason}
                onChange={(e) => setRestructureReason(e.target.value)}
                className="form-input"
                placeholder="مثال: ظروف مالية للعميل، اتفاق جديد على مدة أطول"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              تأكيد إعادة الهيكلة
            </button>
            <button
              type="button"
              onClick={() => setShowRestructureForm(false)}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              إلغاء
            </button>
            {restructureError && (
              <p className="w-full text-sm text-destructive">{restructureError}</p>
            )}
          </form>
        )}

        {showPromiseForm && (
          <form
            onSubmit={handleAddPromise}
            className="mt-4 flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">تاريخ الوعد *</span>
              <input
                type="date"
                required
                value={promiseDate}
                onChange={(e) => setPromiseDate(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">المبلغ المتوقع *</span>
              <input
                type="number"
                min="0"
                required
                value={promiseAmount}
                onChange={(e) => setPromiseAmount(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
            <label className="block flex-1 space-y-1">
              <span className="text-xs font-medium text-foreground">ملاحظات</span>
              <input
                value={promiseNotes}
                onChange={(e) => setPromiseNotes(e.target.value)}
                className="form-input"
              />
            </label>
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              حفظ الوعد
            </button>
            <button
              type="button"
              onClick={() => setShowPromiseForm(false)}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              إلغاء
            </button>
            {promiseError && <p className="w-full text-sm text-destructive">{promiseError}</p>}
          </form>
        )}

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
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
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
            <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
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

        {promises.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">وعود الدفع (§51)</h2>
            <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">تاريخ الوعد</th>
                    <th className="px-4 py-3 font-medium">المبلغ المتوقع</th>
                    <th className="px-4 py-3 font-medium">ملاحظات</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                  </tr>
                </thead>
                <tbody>
                  {promises.map((promise) => {
                    const effective = getEffectivePromiseStatus(promise);
                    return (
                      <tr key={promise.id} className="border-b border-border last:border-0">
                        <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                          {new Date(promise.promise_date).toLocaleDateString("ar-EG")}
                        </td>
                        <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                          {promise.expected_amount.toLocaleString("ar-EG")} ج.م
                        </td>
                        <td className="px-4 py-3 text-muted-foreground">{promise.notes ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded-full px-2 py-0.5 text-xs font-medium ${PROMISE_STATUS_CLASS[effective]}`}
                          >
                            {PROMISE_STATUS_LABEL[effective]}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {restructureEvents.length > 0 && (
          <section className="mt-8">
            <h2 className="text-lg font-bold text-foreground">سجل إعادة الهيكلة (§48)</h2>
            <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
              <table className="w-full text-right text-sm">
                <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المبلغ المتبقي وقتها</th>
                    <th className="px-4 py-3 font-medium">المدة الجديدة</th>
                    <th className="px-4 py-3 font-medium">السبب</th>
                  </tr>
                </thead>
                <tbody>
                  {restructureEvents.map((event) => (
                    <tr key={event.id} className="border-b border-border last:border-0">
                      <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                        {new Date(event.created_at).toLocaleString("ar-EG")}
                      </td>
                      <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                        {event.remaining_amount.toLocaleString("ar-EG")} ج.م
                      </td>
                      <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                        {event.new_duration_months} شهر
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{event.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">جدول الأقساط</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
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
