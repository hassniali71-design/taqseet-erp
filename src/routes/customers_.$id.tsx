import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { RiskBadge } from "@/components/ui/StatCard";
import {
  createGuarantor,
  getCustomerExposure,
  getCustomerRiskAssessment,
  getCustomers,
  getGuarantors,
  getInstallmentContracts,
  getSales,
  subscribeData,
} from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/customers_/$id")({
  component: CustomerDetailPage,
});

function CustomerDetailPage() {
  const session = useRequireSession();
  const { id } = Route.useParams();
  const [, forceRerender] = useState(0);
  const [showGuarantorForm, setShowGuarantorForm] = useState(false);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [relationship, setRelationship] = useState("");

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  if (!session) return null;
  const actorUserId = session.user_id;

  const customer = getCustomers(session.tenant_id).find((c) => c.id === id);
  if (!customer) {
    return (
      <div className="flex min-h-screen bg-background">
        <AppSidebar session={session} />
        <main className="flex-1 mx-auto max-w-5xl px-4 py-8 text-center text-muted-foreground">
          العميل غير موجود.{" "}
          <Link to="/customers" className="text-primary hover:underline">
            العودة للعملاء
          </Link>
        </main>
      </div>
    );
  }

  const guarantors = getGuarantors(session.tenant_id).filter((g) => g.customer_id === id);
  const sales = getSales(session.tenant_id)
    .filter((s) => s.customer_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const totalPurchases = sales.reduce((sum, s) => sum + s.total, 0);
  const contracts = getInstallmentContracts(session.tenant_id)
    .filter((c) => c.customer_id === id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const exposure = getCustomerExposure(id);

  function handleAddGuarantor(event: FormEvent) {
    event.preventDefault();
    createGuarantor(
      {
        customer_id: id,
        name: name.trim(),
        phone: phone.trim(),
        ...(relationship.trim() && { relationship: relationship.trim() }),
      },
      actorUserId,
    );
    setName("");
    setPhone("");
    setRelationship("");
    setShowGuarantorForm(false);
  }

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <Link to="/customers" className="text-xs text-muted-foreground hover:underline">
          ← كل العملاء
        </Link>

        <div className="mt-2 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold text-foreground">{customer.name}</h1>
            <p className="mt-1 text-sm text-muted-foreground" dir="ltr">
              {customer.code} · {customer.phone}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <RiskBadge assessment={getCustomerRiskAssessment(customer.id)} />
            <span
              className={
                customer.status === "active"
                  ? "rounded-full bg-success/15 px-2 py-0.5 text-xs font-medium text-success"
                  : "rounded-full bg-muted px-2 py-0.5 text-xs font-medium text-muted-foreground"
              }
            >
              {customer.status === "active" ? "نشط" : "موقوف"}
            </span>
          </div>
        </div>

        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">إجمالي المشتريات</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {totalPurchases.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">عدد الفواتير</p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {sales.length}
            </p>
          </div>
          <div className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs text-muted-foreground">
              حد الائتمان (المستحق حاليًا {exposure.toLocaleString("ar-EG")})
            </p>
            <p className="mt-1 text-2xl font-bold text-foreground" dir="ltr">
              {customer.credit_limit.toLocaleString("ar-EG")} ج.م
            </p>
          </div>
        </div>

        <section className="mt-8">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-foreground">الضامنون</h2>
            {!showGuarantorForm && (
              <button
                onClick={() => setShowGuarantorForm(true)}
                className="text-xs font-medium text-primary hover:underline"
              >
                + إضافة ضامن
              </button>
            )}
          </div>

          {showGuarantorForm && (
            <form
              onSubmit={handleAddGuarantor}
              className="mt-3 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الاسم *</span>
                  <input
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="form-input"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">الهاتف *</span>
                  <input
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="form-input"
                    dir="ltr"
                  />
                </label>
                <label className="block space-y-1">
                  <span className="text-xs font-medium text-foreground">صلة القرابة</span>
                  <input
                    value={relationship}
                    onChange={(e) => setRelationship(e.target.value)}
                    className="form-input"
                  />
                </label>
              </div>
              <div className="flex gap-2">
                <button
                  type="submit"
                  className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
                >
                  حفظ
                </button>
                <button
                  type="button"
                  onClick={() => setShowGuarantorForm(false)}
                  className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
                >
                  إلغاء
                </button>
              </div>
            </form>
          )}

          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">الاسم</th>
                  <th className="px-4 py-3 font-medium">الهاتف</th>
                  <th className="px-4 py-3 font-medium">الصلة</th>
                </tr>
              </thead>
              <tbody>
                {guarantors.map((g) => (
                  <tr key={g.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">{g.name}</td>
                    <td className="px-4 py-3 text-muted-foreground" dir="ltr">
                      {g.phone}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{g.relationship ?? "—"}</td>
                  </tr>
                ))}
                {guarantors.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد ضامنون بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">عقود التقسيط</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم العقد</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {contracts.map((contract) => (
                  <tr key={contract.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        to="/contracts/$id"
                        params={{ id: contract.id }}
                        className="text-primary hover:underline"
                        dir="ltr"
                      >
                        {contract.contract_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {contract.total_amount.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{contract.status}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(contract.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {contracts.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد عقود تقسيط بعد.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8">
          <h2 className="text-lg font-bold text-foreground">سجل المشتريات</h2>
          <div className="mt-3 max-h-[26rem] overflow-y-auto overflow-x-auto rounded-xl border border-border bg-card">
            <table className="w-full text-right text-sm">
              <thead className="sticky top-0 z-10 border-b border-border bg-card text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم الفاتورة</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody>
                {sales.map((sale) => (
                  <tr key={sale.id} className="border-b border-border last:border-0">
                    <td className="px-4 py-3 font-medium text-foreground">
                      <Link
                        to="/sales/$id"
                        params={{ id: sale.id }}
                        className="text-primary hover:underline"
                        dir="ltr"
                      >
                        {sale.invoice_number}
                      </Link>
                    </td>
                    <td className="px-4 py-3 font-medium text-foreground" dir="ltr">
                      {sale.total.toLocaleString("ar-EG")} ج.م
                    </td>
                    <td className="px-4 py-3 text-xs text-muted-foreground" dir="ltr">
                      {new Date(sale.created_at).toLocaleString("ar-EG")}
                    </td>
                  </tr>
                ))}
                {sales.length === 0 && (
                  <tr>
                    <td colSpan={3} className="px-4 py-6 text-center text-muted-foreground">
                      لا يوجد مشتريات بعد.
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
