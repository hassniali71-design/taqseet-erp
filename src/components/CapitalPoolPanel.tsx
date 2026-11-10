/** بند 92 — كارت «رأس المال» + «توزيع أرباح» في صفحة الشركاء، لمحل الشركاء فيه رأس مال واحد
 * (partners_mode = 'capital_pool'). بيرد على «فلوسنا فين؟»: رأس المال، والخزن، والبضاعة بالتكلفة،
 * واللي لسه عند العملاء. التوزيع: البرنامج يقترح بنسبة رأس المال، والمالك يعدّل أي رقم. */
import { useState } from "react";
import { toast } from "sonner";

import { DateInput } from "@/components/ui/DateInput";
import { computeCapitalShares, computePeriodProfit, splitByShares } from "@/lib/capital-pool";
import { playSound } from "@/lib/sounds";
import {
  computeAccountBalance,
  computeProductStock,
  useDistributePartnerProfit,
  useInstallmentContracts,
  useInstallments,
  useInventoryMovements,
  useJournalEntries,
  usePartners,
  usePartnerTransactions,
  useProducts,
  useProductSerials,
  useSales,
  useTreasuryAccounts,
  useTreasuryMovements,
} from "@/lib/supabase-queries";

const money = (n: number) => `${n.toLocaleString("ar-EG")} ج.م`;
const monthStart = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
};
const today = () => new Date().toISOString().slice(0, 10);

export function CapitalPoolPanel({
  tenantId,
  actorUserId,
  canDistribute,
}: {
  tenantId: string;
  actorUserId: string;
  /** المالك بس (صلاحيات كاملة). */
  canDistribute: boolean;
}) {
  const { data: partners = [] } = usePartners(tenantId);
  const { data: transactions = [] } = usePartnerTransactions(tenantId);
  const { data: accounts = [] } = useTreasuryAccounts(tenantId);
  const { data: treasuryMovements = [] } = useTreasuryMovements(tenantId);
  const { data: products = [] } = useProducts(tenantId);
  const { data: serials = [] } = useProductSerials(tenantId);
  const { data: stockMovements = [] } = useInventoryMovements(tenantId);
  const { data: contracts = [] } = useInstallmentContracts(tenantId);
  const { data: installments = [] } = useInstallments(tenantId);
  const { data: sales = [] } = useSales(tenantId);
  const { data: journal = [] } = useJournalEntries(tenantId);
  const distribute = useDistributePartnerProfit(tenantId);

  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [amounts, setAmounts] = useState<Record<string, string> | null>(null);
  const [accountId, setAccountId] = useState("");

  const activeAccounts = accounts.filter((a) => a.active);
  const { rows, total: totalCapital } = computeCapitalShares(
    partners.filter((p) => p.active),
    transactions,
  );
  const treasury = activeAccounts.reduce(
    (s, a) => s + computeAccountBalance(a.id, treasuryMovements),
    0,
  );
  const stockValue = products
    .filter((p) => p.active)
    .reduce(
      (s, p) =>
        s +
        Math.max(0, computeProductStock(p.id, p.serial_required, serials, stockMovements)) *
          (p.cost_price ?? 0),
      0,
    );
  const liveContracts = new Set(contracts.filter((c) => c.status !== "cancelled").map((c) => c.id));
  const atCustomers = installments
    .filter(
      (i) =>
        liveContracts.has(i.contract_id) && i.status !== "waived" && i.status !== "rescheduled",
    )
    .reduce((s, i) => s + Math.max(0, i.amount - i.paid_amount), 0);

  const fromDate = new Date(`${from}T00:00:00`);
  const toDate = new Date(`${to}T23:59:59`);
  const profit = computePeriodProfit(fromDate, toDate, sales, contracts, journal, products);
  const suggested = splitByShares(Math.max(0, profit.net), rows);
  const current =
    amounts ??
    Object.fromEntries(rows.map((r) => [r.partner.id, String(suggested[r.partner.id] ?? 0)]));
  const shares = rows.map((r) => ({
    partnerId: r.partner.id,
    amount: Number(current[r.partner.id]) || 0,
  }));
  const shareTotal = Math.round(shares.reduce((s, x) => s + x.amount, 0) * 100) / 100;
  const periodLabel = `${from} إلى ${to}`;

  function run(payout: boolean) {
    if (payout && !accountId) {
      toast.error("اختار الخزينة اللي هيتصرف منها");
      return;
    }
    const msg = payout
      ? `صرف ${money(shareTotal)} كاش من الخزينة للشركاء؟`
      : `ترحيل ${money(shareTotal)} لأرصدة الشركاء من غير كاش؟`;
    if (!window.confirm(msg)) return;
    distribute.mutate(
      { shares, periodLabel, ...(payout && { payoutAccountId: accountId }), actorUserId },
      {
        onSuccess: () => {
          playSound("done");
          toast.success(payout ? "اتصرفت الأرباح" : "اترحّلت الأرباح لأرصدتهم");
          setOpen(false);
          setAmounts(null);
        },
        onError: (e) => {
          playSound("error");
          toast.error(e.message);
        },
      },
    );
  }

  const history = transactions
    .filter((t) => t.type === "adjustment" && t.reference === "توزيع أرباح")
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 20);

  return (
    <section className="mt-6 space-y-4 rounded-xl border-2 border-primary/50 bg-card p-5 shadow-sm">
      <h2 className="text-base font-extrabold text-foreground">💼 رأس مال المشروع — فلوسنا فين؟</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {(
          [
            ["رأس المال (حطوا − سحبوا)", totalCapital],
            ["في الخزن", treasury],
            ["بضاعة في المخزن (بالتكلفة)", stockValue],
            ["عند العملاء (أقساط وآجل)", atCustomers],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-lg border border-border p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-lg font-extrabold text-foreground" dir="ltr">
              {money(Math.round(v * 100) / 100)}
            </p>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="keep-table w-full text-right text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr className="border-b border-border">
              <th className="px-3 py-2 font-medium">الشريك</th>
              <th className="px-3 py-2 font-medium">حط</th>
              <th className="px-3 py-2 font-medium">سحب</th>
              <th className="px-3 py-2 font-medium">رأس ماله</th>
              <th className="px-3 py-2 font-medium">نسبته</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.partner.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-bold text-foreground">{r.partner.name}</td>
                <td className="px-3 py-2" dir="ltr">
                  {money(r.funded)}
                </td>
                <td className="px-3 py-2" dir="ltr">
                  {money(r.withdrawn)}
                </td>
                <td className="px-3 py-2 font-bold" dir="ltr">
                  {money(r.capital)}
                </td>
                <td className="px-3 py-2 font-bold text-primary" dir="ltr">
                  {r.sharePct}%
                </td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-4 text-center text-muted-foreground">
                  ضيف الشركاء (ومنهم صاحب المحل) وسجّل اللي حطه كل واحد.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canDistribute && !open && rows.length > 0 && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90"
        >
          💰 توزيع أرباح
        </button>
      )}

      {canDistribute && open && (
        <div className="space-y-3 rounded-lg border border-primary/40 bg-primary/5 p-4">
          <div className="flex flex-wrap gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">من</span>
              <DateInput
                value={from}
                onChange={(v) => {
                  setFrom(v);
                  setAmounts(null);
                }}
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">إلى</span>
              <DateInput
                value={to}
                onChange={(v) => {
                  setTo(v);
                  setAmounts(null);
                }}
              />
            </label>
          </div>
          <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
            <p>
              البيع الكاش: <b dir="ltr">{money(profit.cashSales)}</b> − تكلفته{" "}
              <b dir="ltr">{money(profit.cashCost)}</b>
            </p>
            <p>
              التقسيط (بسعر الكاش): <b dir="ltr">{money(profit.installmentSales)}</b> − تكلفته{" "}
              <b dir="ltr">{money(profit.installmentCost)}</b>
            </p>
            <p>
              إيراد التقسيط (الزيادة): <b dir="ltr">{money(profit.financeRevenue)}</b>
            </p>
            <p>
              المصروفات: <b dir="ltr">{money(profit.expenses)}</b>
            </p>
          </div>
          <p className="text-base font-extrabold text-foreground">
            صافي الربح المقترح: <span dir="ltr">{money(profit.net)}</span>
          </p>
          <p className="text-xs text-muted-foreground">
            التكلفة بسعر تكلفة الصنف دلوقتي، فالرقم ده اقتراح — عدّل أي مبلغ براحتك.
          </p>
          <div className="space-y-2">
            {rows.map((r) => (
              <label key={r.partner.id} className="flex items-center gap-2">
                <span className="w-32 truncate text-sm font-bold">{r.partner.name}</span>
                <span className="w-14 text-xs text-muted-foreground" dir="ltr">
                  {r.sharePct}%
                </span>
                <input
                  type="number"
                  min="0"
                  value={current[r.partner.id] ?? ""}
                  onChange={(e) => setAmounts({ ...current, [r.partner.id]: e.target.value })}
                  className="form-input w-36"
                  dir="ltr"
                />
              </label>
            ))}
            <p className="text-sm font-bold">
              المجموع: <span dir="ltr">{money(shareTotal)}</span>
            </p>
          </div>
          <label className="block max-w-xs space-y-1">
            <span className="text-xs font-medium">الخزينة اللي هيتصرف منها (للصرف الكاش)</span>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              className="form-input"
            >
              <option value="">اختار خزينة</option>
              {activeAccounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {money(computeAccountBalance(a.id, treasuryMovements))}
                </option>
              ))}
            </select>
          </label>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={distribute.isPending || shareTotal <= 0}
              onClick={() => run(true)}
              className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
              صرف كاش
            </button>
            <button
              type="button"
              disabled={distribute.isPending || shareTotal <= 0}
              onClick={() => run(false)}
              className="rounded-md border border-primary/60 px-4 py-2 text-sm font-bold hover:bg-primary/10 disabled:opacity-50"
            >
              ترحيل لرصيدهم (من غير كاش)
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setAmounts(null);
              }}
              className="rounded-md border border-input px-4 py-2 text-sm"
            >
              إلغاء
            </button>
          </div>
        </div>
      )}

      {history.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted-foreground">آخر التوزيعات</p>
          <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
            {history.map((t) => (
              <li key={t.id}>
                {new Date(t.created_at).toLocaleDateString("ar-EG")} —{" "}
                {partners.find((p) => p.id === t.partner_id)?.name}:{" "}
                <span dir="ltr">{money(t.amount)}</span> ({t.reason})
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
