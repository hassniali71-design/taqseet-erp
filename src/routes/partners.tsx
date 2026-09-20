import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import {
  computePartnerAllocatedCost,
  computePartnerBalance,
  computePartnerTotalFunded,
  dateInputToTimestamp,
  useAddPartnerFunding,
  useCreatePartner,
  usePartners,
  usePartnerTransactions,
  useWithdrawPartnerFunds,
} from "@/lib/supabase-queries";
import { useRequireSession } from "@/hooks/use-session";

export const Route = createFileRoute("/partners")({
  component: PartnersPage,
});

type FormState = {
  name: string;
  phone: string;
  profit_share_pct: string;
  notes: string;
  join_date: string;
};

const EMPTY_FORM: FormState = {
  name: "",
  phone: "",
  profit_share_pct: "50",
  notes: "",
  join_date: "",
};

function PartnersPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [actionForId, setActionForId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"funding" | "withdrawal">("funding");
  const [actionAmount, setActionAmount] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: partners = [] } = usePartners(session?.tenant_id);
  const { data: transactions = [] } = usePartnerTransactions(session?.tenant_id);
  const createPartnerMutation = useCreatePartner(session?.tenant_id);
  const addFundingMutation = useAddPartnerFunding(session?.tenant_id);
  const withdrawMutation = useWithdrawPartnerFunds(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    createPartnerMutation.mutate({
      input: {
        name: form.name.trim(),
        profit_share_pct: Number(form.profit_share_pct) || 0,
        ...(form.phone.trim() && { phone: form.phone.trim() }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
      },
      actorUserId,
      ...(form.join_date && { createdAt: dateInputToTimestamp(form.join_date) }),
    });
    setCreating(false);
    setForm(EMPTY_FORM);
  }

  function handleConfirmAction(partnerId: string) {
    setActionError(null);
    const amount = Number(actionAmount);
    if (!actionAmount || amount <= 0) {
      setActionError("أدخل مبلغ صحيح");
      return;
    }
    const onSettled = {
      onSuccess: () => {
        setActionForId(null);
        setActionAmount("");
      },
      onError: (e: unknown) => setActionError(e instanceof Error ? e.message : "حدث خطأ"),
    };
    if (actionMode === "funding") {
      addFundingMutation.mutate({ partnerId, amount, actorUserId }, onSettled);
    } else {
      withdrawMutation.mutate({ partnerId, amount, actorUserId }, onSettled);
    }
  }

  const filtered = partners.filter((p) => p.name.includes(query.trim()));

  // نظرة عامة على مستوى كل الشركاء — حوكمة/داش بورد يطلب العميل صراحة، مش بس كارت لكل شريك
  // لوحده. المكاسب هنا بتحرّك رصيد الشريك فعليًا؛ "اتخصم منه" معلومة شفافية بس (انظر تعليق
  // settlePartnersForDeal في supabase-queries.ts) — رأس ماله يفضل معترف بيه وقت التمويل نفسه.
  const totalFundedAll = partners.reduce(
    (sum, p) => sum + computePartnerTotalFunded(p.id, transactions),
    0,
  );
  const totalAllocatedAll = partners.reduce(
    (sum, p) => sum + computePartnerAllocatedCost(p.id, transactions),
    0,
  );
  const totalProfitAll = transactions
    .filter((t) => t.type === "sale_settlement")
    .reduce((sum, t) => sum + t.profit_amount, 0);
  const totalBalanceAll = partners.reduce(
    (sum, p) => sum + computePartnerBalance(p.id, transactions),
    0,
  );

  return (
    <div className="flex min-h-screen bg-background">
      <AppSidebar session={session} />
      <main className="flex-1 mx-auto max-w-5xl px-4 py-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold text-foreground">الشركاء</h1>
          {!creating && (
            <button
              onClick={() => setCreating(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              + إضافة شريك
            </button>
          )}
        </div>
        <p className="mt-1 text-sm text-muted-foreground">
          شركاء تمويل بيموّلوا شراء بضاعة — لما تتباع، النظام بيسجّل نصيبهم من كل صفقة (كام اتخصم من
          تمويلهم، وكام ربحهم) تلقائيًا.
        </p>

        {partners.length > 0 && (
          <section className="mt-6">
            <h2 className="text-sm font-bold text-foreground">نظرة عامة على كل الشركاء</h2>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">إجمالي التمويل</p>
                <p className="mt-1 text-xl font-bold text-foreground" dir="ltr">
                  {totalFundedAll.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">مخصص لصفقات (اتخصم من التمويل)</p>
                <p className="mt-1 text-xl font-bold text-foreground" dir="ltr">
                  {totalAllocatedAll.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <div className="rounded-xl border border-border bg-card p-4">
                <p className="text-xs text-muted-foreground">إجمالي أرباح الشركاء</p>
                <p className="mt-1 text-xl font-bold text-success" dir="ltr">
                  {totalProfitAll.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
              <div className="rounded-xl border-2 border-primary/40 bg-primary/5 p-4">
                <p className="text-xs text-muted-foreground">إجمالي أرصدة الشركاء الآن</p>
                <p className="mt-1 text-xl font-bold text-foreground" dir="ltr">
                  {totalBalanceAll.toLocaleString("ar-EG")} ج.م
                </p>
              </div>
            </div>
          </section>
        )}

        {creating && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">شريك جديد</h2>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="الاسم *">
                <input
                  required
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="الهاتف">
                <input
                  value={form.phone}
                  onChange={(e) => setForm({ ...form, phone: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="نسبة ربحه من الصفقات %">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.profit_share_pct}
                  onChange={(e) => setForm({ ...form, profit_share_pct: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="تاريخ الانضمام (سيبه فاضي لو دلوقتي)">
                <input
                  type="date"
                  value={form.join_date}
                  onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
            </div>
            <Field label="ملاحظات">
              <textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                className="form-input"
                rows={2}
              />
            </Field>
            <div className="flex gap-2">
              <button
                type="submit"
                className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
              >
                حفظ
              </button>
              <button
                type="button"
                onClick={() => {
                  setCreating(false);
                  setForm(EMPTY_FORM);
                }}
                className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
              >
                إلغاء
              </button>
            </div>
          </form>
        )}

        <label className="mt-6 block max-w-sm space-y-1">
          <span className="text-xs font-medium text-foreground">بحث بالاسم</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ابحث عن شريك..."
            className="form-input"
          />
        </label>

        <div className="mt-4 grid max-h-[48rem] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
          {filtered.map((partner) => {
            const balance = computePartnerBalance(partner.id, transactions);
            const totalFunded = computePartnerTotalFunded(partner.id, transactions);
            const totalAllocated = computePartnerAllocatedCost(partner.id, transactions);
            const totalProfit = transactions
              .filter((t) => t.partner_id === partner.id && t.type === "sale_settlement")
              .reduce((sum, t) => sum + t.profit_amount, 0);
            const dealCount = transactions.filter(
              (t) => t.partner_id === partner.id && t.type === "sale_settlement",
            ).length;
            return (
              <div
                key={partner.id}
                className="rounded-xl border border-border bg-card p-5 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <Link
                      to="/partners/$id"
                      params={{ id: partner.id }}
                      className="font-bold text-foreground hover:underline"
                    >
                      {partner.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                      {partner.code} · نسبة الربح {partner.profit_share_pct}% · {dealCount} صفقة
                    </p>
                  </div>
                  <div className="flex shrink-0 gap-2">
                    <button
                      onClick={() => {
                        setActionForId(actionForId === partner.id ? null : partner.id);
                        setActionMode("funding");
                        setActionError(null);
                        setActionAmount("");
                      }}
                      className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      + تمويل
                    </button>
                    <button
                      onClick={() => {
                        setActionForId(actionForId === partner.id ? null : partner.id);
                        setActionMode("withdrawal");
                        setActionError(null);
                        setActionAmount("");
                      }}
                      className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      سحب
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">دفع كام (إجمالي التمويل)</p>
                    <p className="mt-0.5 text-base font-bold text-foreground" dir="ltr">
                      {totalFunded.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">اتخصم منه (مخصص لصفقات)</p>
                    <p className="mt-0.5 text-base font-bold text-foreground" dir="ltr">
                      {totalAllocated.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">هيكسب (إجمالي الأرباح)</p>
                    <p className="mt-0.5 text-base font-bold text-success" dir="ltr">
                      {totalProfit.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">رصيده الحالي (بعد الربح)</p>
                    <p className="mt-0.5 text-base font-bold text-primary" dir="ltr">
                      {balance.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                </div>
                {actionForId === partner.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-foreground">
                        مبلغ {actionMode === "funding" ? "التمويل" : "السحب"}
                      </span>
                      <input
                        type="number"
                        min="0"
                        value={actionAmount}
                        onChange={(e) => setActionAmount(e.target.value)}
                        className="form-input"
                        dir="ltr"
                      />
                    </label>
                    <button
                      onClick={() => handleConfirmAction(partner.id)}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      تأكيد
                    </button>
                    {actionError && (
                      <p className="w-full text-xs text-destructive">{actionError}</p>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
              {partners.length === 0 ? "لا يوجد شركاء بعد." : "لا يوجد نتائج."}
            </p>
          )}
        </div>
      </main>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-foreground">{label}</span>
      {children}
    </label>
  );
}
