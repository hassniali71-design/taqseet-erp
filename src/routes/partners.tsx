import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppSidebar } from "@/components/AppSidebar";
import { subscribeData } from "@/lib/data-store";
import {
  computePartnerBalance,
  dateInputToTimestamp,
  useAddPartnerFunding,
  useCreatePartner,
  usePartners,
  usePartnerTransactions,
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
  const [fundingForId, setFundingForId] = useState<string | null>(null);
  const [fundingAmount, setFundingAmount] = useState("");
  const [fundingError, setFundingError] = useState<string | null>(null);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const { data: partners = [] } = usePartners(session?.tenant_id);
  const { data: transactions = [] } = usePartnerTransactions(session?.tenant_id);
  const createPartnerMutation = useCreatePartner(session?.tenant_id);
  const addFundingMutation = useAddPartnerFunding(session?.tenant_id);

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

  function handleAddFunding(partnerId: string) {
    setFundingError(null);
    const amount = Number(fundingAmount);
    if (!fundingAmount || amount <= 0) {
      setFundingError("أدخل مبلغ صحيح");
      return;
    }
    addFundingMutation.mutate(
      { partnerId, amount, actorUserId },
      {
        onSuccess: () => {
          setFundingForId(null);
          setFundingAmount("");
        },
        onError: (e) => setFundingError(e instanceof Error ? e.message : "حدث خطأ"),
      },
    );
  }

  const filtered = partners.filter((p) => p.name.includes(query.trim()));

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
          شركاء تمويل بيموّلوا شراء بضاعة — لما تتباع، النظام بيرجعلهم رأس مالهم + نصيبهم من الربح
          تلقائيًا.
        </p>

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

        <div className="mt-4 grid max-h-[42rem] grid-cols-1 gap-4 overflow-y-auto sm:grid-cols-2">
          {filtered.map((partner) => {
            const balance = computePartnerBalance(partner.id, transactions);
            const totalProfit = transactions
              .filter((t) => t.partner_id === partner.id)
              .reduce((sum, t) => sum + t.profit_amount, 0);
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
                      {partner.code} · نسبة الربح {partner.profit_share_pct}%
                    </p>
                  </div>
                  <button
                    onClick={() => {
                      setFundingForId(fundingForId === partner.id ? null : partner.id);
                      setFundingError(null);
                      setFundingAmount("");
                    }}
                    className="whitespace-nowrap rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
                  >
                    + إضافة تمويل
                  </button>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-muted-foreground">الرصيد الحالي</p>
                    <p className="mt-0.5 text-lg font-bold text-foreground" dir="ltr">
                      {balance.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">إجمالي الأرباح لتاريخه</p>
                    <p className="mt-0.5 text-lg font-bold text-success" dir="ltr">
                      {totalProfit.toLocaleString("ar-EG")} ج.م
                    </p>
                  </div>
                </div>
                {fundingForId === partner.id && (
                  <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-border pt-3">
                    <label className="block space-y-1">
                      <span className="text-xs font-medium text-foreground">مبلغ التمويل</span>
                      <input
                        type="number"
                        min="0"
                        value={fundingAmount}
                        onChange={(e) => setFundingAmount(e.target.value)}
                        className="form-input"
                        dir="ltr"
                      />
                    </label>
                    <button
                      onClick={() => handleAddFunding(partner.id)}
                      className="rounded-md bg-primary px-3 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                    >
                      تأكيد
                    </button>
                    {fundingError && (
                      <p className="w-full text-xs text-destructive">{fundingError}</p>
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
