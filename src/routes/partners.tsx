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
  useDeletePartner,
  usePartners,
  usePartnerTransactions,
  useUpdatePartner,
  useWithdrawPartnerFunds,
} from "@/lib/supabase-queries";
import { useOwnerPasswordConfirm } from "@/hooks/use-owner-password-confirm";
import { useRequireSession } from "@/hooks/use-session";
import type { Partner } from "@/types";

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
  const [editingId, setEditingId] = useState<string | "new" | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [query, setQuery] = useState("");
  const [actionForId, setActionForId] = useState<string | null>(null);
  const [actionMode, setActionMode] = useState<"funding" | "withdrawal">("funding");
  const [actionAmount, setActionAmount] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const { requestConfirm, dialog: passwordDialog } = useOwnerPasswordConfirm();

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: partners = [] } = usePartners(session?.tenant_id);
  const { data: transactions = [] } = usePartnerTransactions(session?.tenant_id);
  const createPartnerMutation = useCreatePartner(session?.tenant_id);
  const updatePartnerMutation = useUpdatePartner(session?.tenant_id);
  const deletePartnerMutation = useDeletePartner(session?.tenant_id);
  const addFundingMutation = useAddPartnerFunding(session?.tenant_id);
  const withdrawMutation = useWithdrawPartnerFunds(session?.tenant_id);

  if (!session) return null;
  const actorUserId = session.user_id;

  function startCreate() {
    setForm(EMPTY_FORM);
    setEditingId("new");
  }

  function startEdit(partner: Partner) {
    setForm({
      name: partner.name,
      phone: partner.phone ?? "",
      profit_share_pct: String(partner.profit_share_pct),
      notes: partner.notes ?? "",
      join_date: "",
    });
    setEditingId(partner.id);
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const payload = {
      name: form.name.trim(),
      profit_share_pct: Number(form.profit_share_pct) || 0,
      ...(form.phone.trim() && { phone: form.phone.trim() }),
      ...(form.notes.trim() && { notes: form.notes.trim() }),
    };
    if (editingId === "new") {
      createPartnerMutation.mutate({
        input: payload,
        actorUserId,
        ...(form.join_date && { createdAt: dateInputToTimestamp(form.join_date) }),
      });
    } else if (editingId) {
      updatePartnerMutation.mutate({ id: editingId, patch: payload, actorUserId });
    }
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function toggleActive(partner: Partner) {
    updatePartnerMutation.mutate({
      id: partner.id,
      patch: { active: !partner.active },
      actorUserId,
    });
  }

  async function handleDelete(partner: Partner) {
    setDeleteError(null);
    if (
      !window.confirm(
        `حذف "${partner.name}" نهائيًا؟ لو عنده أي تمويل أو سحب أو صفقة مسجّلة، الحذف هيترفض ولازم تستخدم زرار الإيقاف بدلاً منه.`,
      )
    ) {
      return;
    }
    const confirmed = await requestConfirm();
    if (!confirmed) return;
    try {
      await deletePartnerMutation.mutateAsync({ id: partner.id, actorUserId });
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : "حدث خطأ أثناء الحذف");
    }
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
          {editingId === null && (
            <button
              onClick={startCreate}
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

        {editingId !== null && (
          <form
            onSubmit={handleSubmit}
            className="mt-4 space-y-3 rounded-xl border border-border bg-card p-5 shadow-sm"
          >
            <h2 className="text-sm font-bold text-foreground">
              {editingId === "new" ? "شريك جديد" : "تعديل بيانات الشريك"}
            </h2>
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
              {editingId === "new" && (
                <Field label="تاريخ الانضمام (سيبه فاضي لو دلوقتي)">
                  <input
                    type="date"
                    value={form.join_date}
                    onChange={(e) => setForm({ ...form, join_date: e.target.value })}
                    className="form-input"
                    dir="ltr"
                  />
                </Field>
              )}
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
                  setEditingId(null);
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
                    <div className="flex items-center gap-2">
                      <Link
                        to="/partners/$id"
                        params={{ id: partner.id }}
                        className="font-bold text-foreground hover:underline"
                      >
                        {partner.name}
                      </Link>
                      <span
                        className={
                          partner.active
                            ? "rounded-full bg-success/15 px-2 py-0.5 text-[11px] font-medium text-success"
                            : "rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground"
                        }
                      >
                        {partner.active ? "نشط" : "موقوف"}
                      </span>
                    </div>
                    <p className="mt-0.5 text-xs text-muted-foreground" dir="ltr">
                      {partner.code} · نسبة الربح {partner.profit_share_pct}% · {dealCount} صفقة
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-2">
                    <button
                      onClick={() => startEdit(partner)}
                      className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      تعديل
                    </button>
                    <button
                      onClick={() => toggleActive(partner)}
                      className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                    >
                      {partner.active ? "إيقاف" : "تفعيل"}
                    </button>
                    <button
                      onClick={() => void handleDelete(partner)}
                      className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-destructive hover:bg-accent"
                    >
                      حذف
                    </button>
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
                <Link
                  to="/partners/$id"
                  params={{ id: partner.id }}
                  className="mt-3 block rounded-md border border-primary/40 bg-primary/5 px-3 py-2 text-center text-xs font-bold text-primary hover:bg-primary/10"
                >
                  عرض كل التفاصيل — صفقاته، أقساطه، وكشف حسابه ←
                </Link>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <p className="col-span-full rounded-xl border border-border bg-card px-4 py-6 text-center text-muted-foreground">
              {partners.length === 0 ? "لا يوجد شركاء بعد." : "لا يوجد نتائج."}
            </p>
          )}
        </div>
        {deleteError && <p className="mt-2 text-sm text-destructive">{deleteError}</p>}
        {passwordDialog}
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
