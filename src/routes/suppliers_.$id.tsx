import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import {
  getPurchases,
  getSupplierBalance,
  getSupplierPayments,
  getSuppliers,
  recordSupplierPayment,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/suppliers_/$id")({
  component: SupplierDetailPage,
});

function SupplierDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [payAmount, setPayAmount] = useState("");
  const [payError, setPayError] = useState<string | null>(null);
  const [paySuccess, setPaySuccess] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const supplier = getSuppliers(session.tenant_id).find((s) => s.id === id);
  if (!supplier) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-5xl px-4 py-8 text-center text-muted-foreground">
          المورد غير موجود.{" "}
          <Link to="/suppliers" className="text-primary hover:underline">
            العودة للموردين
          </Link>
        </main>
      </div>
    );
  }

  const supplierId = supplier.id;
  const purchases = getPurchases(session.tenant_id)
    .filter((p) => p.supplier_id === supplierId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const payments = getSupplierPayments(session.tenant_id)
    .filter((p) => p.supplier_id === supplierId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const totalPurchased = purchases.reduce((sum, p) => sum + p.total, 0);
  const balance = getSupplierBalance(supplierId);

  function handleRecordPayment() {
    setPayError(null);
    const amount = Number(payAmount);
    if (!payAmount || amount <= 0) {
      setPayError("أدخل مبلغ صحيح");
      return;
    }
    try {
      recordSupplierPayment(supplierId, amount, actorUserId);
      setPayAmount("");
      setPaySuccess(true);
      setTimeout(() => setPaySuccess(false), 2000);
    } catch (e) {
      setPayError(e instanceof Error ? e.message : "حدث خطأ");
    }
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <Link to="/suppliers" className="text-xs text-muted-foreground hover:underline">
          ← كل الموردين
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{supplier.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              {supplier.code} · {supplier.phone}
            </p>
          </div>
          <span
            className={
              supplier.active
                ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
            }
          >
            {supplier.active ? "نشط" : "موقوف"}
          </span>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {totalPurchased.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">عدد أوامر الشراء</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {purchases.length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">الرصيد المستحق</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {balance.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>

        {balance > 0 && (
          <section className="mt-8 rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">تسجيل دفعة للمورد</h2>
            <div className="mt-3 flex flex-wrap items-end gap-3">
              <label className="block space-y-1">
                <span className="text-xs font-medium text-foreground">
                  المبلغ (المستحق {balance.toLocaleString("ar-EG")} ج.م)
                </span>
                <input
                  type="number"
                  min="0"
                  max={balance}
                  value={payAmount}
                  onChange={(e) => setPayAmount(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
              </label>
              <button
                onClick={handleRecordPayment}
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                تسجيل الدفعة
              </button>
              {paySuccess && <span className="text-sm text-success">تم ✓</span>}
            </div>
            {payError && <p className="mt-2 text-sm text-destructive">{payError}</p>}
          </section>
        )}

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">سجل المدفوعات</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">المبلغ</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {payment.amount.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(payment.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={2} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد مدفوعات بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">أوامر الشراء</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم الأمر</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {purchases.map((purchase) => (
                  <tr key={purchase.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        to="/purchases/$id"
                        params={{ id: purchase.id }}
                        className="text-primary hover:underline"
                        dir="ltr"
                      >
                        {purchase.purchase_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {purchase.total.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(purchase.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {purchases.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد أوامر شراء بعد.
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
