import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";

import { AppHeader } from "@/components/AppHeader";
import { getCurrentTenantSettings, subscribeData, updateTenantSettings } from "@/lib/data-store";
import { useRequireSession } from "@/hooks/use-session";
import type { TenantSettings } from "@/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

type FormState = Record<keyof Omit<TenantSettings, "tenant_id">, string>;

function toFormState(settings: TenantSettings): FormState {
  return {
    currency: settings.currency,
    timezone: settings.timezone,
    costing_method: settings.costing_method,
    employee_discount_limit_pct: String(settings.employee_discount_limit_pct),
    min_down_payment_pct: String(settings.min_down_payment_pct),
    grace_period_days: String(settings.grace_period_days),
    credit_hold_days: String(settings.credit_hold_days),
    late_fee_enabled: String(settings.late_fee_enabled),
    return_period_days: String(settings.return_period_days),
  };
}

function SettingsPage() {
  const session = useRequireSession();
  const [, forceRerender] = useState(0);
  const [saved, setSaved] = useState(false);

  useEffect(() => subscribeData(() => forceRerender((n) => n + 1)), []);

  const settings = session ? getCurrentTenantSettings() : null;
  const [form, setForm] = useState<FormState | null>(settings ? toFormState(settings) : null);

  useEffect(() => {
    if (settings && !form) setForm(toFormState(settings));
    // Only seed the form once on first successful load — afterwards it's user-controlled.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings]);

  if (!session || !form) return null;
  const actorUserId = session.user_id;

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (!form) return;
    updateTenantSettings(
      {
        currency: form.currency,
        timezone: form.timezone,
        costing_method: form.costing_method as TenantSettings["costing_method"],
        employee_discount_limit_pct: Number(form.employee_discount_limit_pct) || 0,
        min_down_payment_pct: Number(form.min_down_payment_pct) || 0,
        grace_period_days: Number(form.grace_period_days) || 0,
        credit_hold_days: Number(form.credit_hold_days) || 0,
        late_fee_enabled: form.late_fee_enabled === "true",
        return_period_days: Number(form.return_period_days) || 0,
      },
      actorUserId,
    );
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="min-h-screen bg-background">
      <AppHeader session={session} />
      <main className="mx-auto max-w-3xl px-4 py-8">
        <h1 className="text-2xl font-bold text-foreground">الإعدادات</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          هذه الإعدادات تُستخدم عبر المراحل القادمة (تقسيط، مرتجعات، ائتمان). أي تعديل هنا مستقبلًا
          لا يغيّر عقودًا أو عمليات قديمة استخدمت القيمة السابقة (§114 Snapshot).
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">عام</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="العملة">
                <input
                  value={form.currency}
                  onChange={(e) => setForm({ ...form, currency: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
              <Field label="المنطقة الزمنية">
                <input
                  value={form.timezone}
                  onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                  className="form-input"
                  dir="ltr"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">المخزون (Phase 2)</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="طريقة التكلفة">
                <select
                  value={form.costing_method}
                  onChange={(e) => setForm({ ...form, costing_method: e.target.value })}
                  className="form-input"
                >
                  <option value="average">متوسط التكلفة</option>
                  <option value="last_purchase">آخر سعر شراء</option>
                  <option value="fifo">FIFO</option>
                </select>
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">المبيعات والخصومات (Phase 3)</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="أقصى خصم مسموح للموظف بدون اعتماد (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.employee_discount_limit_pct}
                  onChange={(e) =>
                    setForm({ ...form, employee_discount_limit_pct: e.target.value })
                  }
                  className="form-input"
                />
              </Field>
              <Field label="فترة السماح بالإرجاع (يوم)">
                <input
                  type="number"
                  min="0"
                  value={form.return_period_days}
                  onChange={(e) => setForm({ ...form, return_period_days: e.target.value })}
                  className="form-input"
                />
              </Field>
            </div>
          </section>

          <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h2 className="text-sm font-bold text-foreground">التقسيط والتحصيل (Phase 4)</h2>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="أقل مقدم مسموح (%)">
                <input
                  type="number"
                  min="0"
                  max="100"
                  value={form.min_down_payment_pct}
                  onChange={(e) => setForm({ ...form, min_down_payment_pct: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="فترة السماح قبل اعتبار القسط متأخر (يوم)">
                <input
                  type="number"
                  min="0"
                  value={form.grace_period_days}
                  onChange={(e) => setForm({ ...form, grace_period_days: e.target.value })}
                  className="form-input"
                />
              </Field>
              <Field label="عدد أيام التأخير قبل إيقاف العميل ائتمانيًا (Credit Hold)">
                <input
                  type="number"
                  min="0"
                  value={form.credit_hold_days}
                  onChange={(e) => setForm({ ...form, credit_hold_days: e.target.value })}
                  className="form-input"
                />
              </Field>
              <label className="flex items-center gap-2 self-end pb-2 text-xs font-medium text-foreground">
                <input
                  type="checkbox"
                  checked={form.late_fee_enabled === "true"}
                  onChange={(e) => setForm({ ...form, late_fee_enabled: String(e.target.checked) })}
                />
                تفعيل غرامة تأخير (غير مفعّلة افتراضيًا — §50)
              </label>
            </div>
          </section>

          <div className="flex items-center gap-3">
            <button
              type="submit"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              حفظ الإعدادات
            </button>
            {saved && <span className="text-sm text-success">تم الحفظ ✓</span>}
          </div>
        </form>
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
