import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppHeader } from "@/components/AppHeader";
import {
  getCurrentTenantSettings,
  getDaysOverdue,
  getEffectiveInstallmentStatus,
  getInstallmentContracts,
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

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;

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

  const settings = getCurrentTenantSettings();
  const installments = getInstallments()
    .filter((i) => i.contract_id === contract.id)
    .sort((a, b) => a.seq - b.seq);

  const totalPaid = installments.reduce((sum, i) => sum + i.paid_amount, 0);
  const remaining = Math.max(0, contract.total_amount - totalPaid);

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
