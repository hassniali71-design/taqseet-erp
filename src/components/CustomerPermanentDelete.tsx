import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";

import { SearchPicker } from "@/components/ui/SearchPicker";
import { deleteCustomerPermanentlyServer } from "@/lib/customer-delete-server";
import { getAccessToken } from "@/lib/supabase-client";
import {
  useCustomers,
  useInstallmentContracts,
  useInstallmentPayments,
  useRoles,
  useSales,
  useUserRoles,
} from "@/lib/supabase-queries";

/** قسم "حذف عميل نهائيًا" في الإعدادات (بند 72) — بيظهر للمالك بس. الفحص هنا للعرض والتوضيح
 * قبل ما المالك يكتب كلمة السر؛ القرار الحقيقي (المالك، كلمة السر، الأهلية، الحذف الذري) كله على
 * السيرفر وفي قاعدة البيانات — انظر src/lib/customer-delete-server.ts وmigration 0027. نفس المكوّن
 * بيتفتح كنافذة من زرار "حذف" في جدول العملاء (presetCustomerId). */
export function CustomerPermanentDelete({
  tenantId,
  userId,
  presetCustomerId,
  onClose,
}: {
  tenantId: string;
  userId: string;
  /** من زرار "حذف" في جدول العملاء: العميل محدد مسبقًا، ومن غير قايمة اختيار. */
  presetCustomerId?: string;
  onClose?: () => void;
}) {
  const queryClient = useQueryClient();
  const { data: roles = [] } = useRoles(tenantId);
  const { data: userRoles = [] } = useUserRoles(tenantId);
  const { data: customers = [] } = useCustomers(tenantId);
  const { data: contracts = [] } = useInstallmentContracts(tenantId);
  const { data: payments = [] } = useInstallmentPayments(tenantId);
  const { data: sales = [] } = useSales(tenantId);

  const [customerId, setCustomerId] = useState(presetCustomerId ?? "");
  const [confirmCode, setConfirmCode] = useState("");
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const deleteMutation = useMutation({
    mutationFn: async () =>
      deleteCustomerPermanentlyServer({
        data: {
          accessToken: await getAccessToken(),
          customerId,
          confirmCode,
          password,
          reason,
        },
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries();
    },
  });

  const ownerRoleId = roles.find((r) => r.name === "owner")?.id;
  const isOwner = userRoles.some((ur) => ur.user_id === userId && ur.role_id === ownerRoleId);
  if (!isOwner) {
    return presetCustomerId ? (
      <section className="rounded-xl border border-border bg-card p-5 text-sm">
        <p className="font-bold text-destructive">الحذف النهائي للعملاء متاح لمالك المحل بس.</p>
        {onClose && (
          <button
            onClick={onClose}
            className="mt-3 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
          >
            إغلاق
          </button>
        )}
      </section>
    ) : null;
  }

  const customer = customers.find((c) => c.id === customerId);
  const customerContracts = contracts.filter((c) => c.customer_id === customerId);
  const contractIds = new Set(customerContracts.map((c) => c.id));
  const customerPayments = payments.filter((p) => contractIds.has(p.contract_id));
  const receiptCount = customerPayments.length;
  const receivedTotal = customerPayments.reduce((sum, p) => sum + p.amount, 0);
  const openContracts = customerContracts.filter((c) => c.status !== "cancelled");
  const cashSalesCount = sales.filter((s) => s.customer_id === customerId).length;

  function reset() {
    setConfirmCode("");
    setReason("");
    setPassword("");
    setAcknowledged(false);
  }

  async function handleDelete() {
    setError(null);
    setDone(null);
    if (!customer) return;
    try {
      const result = await deleteMutation.mutateAsync();
      setDone(
        `اتحذف ${customer.name} (${customer.code}) نهائيًا ✓ — ${result.contracts_deleted} عقد، ${
          result.receipts_deleted
        } إيصال، ${result.treasury_movements_deleted} حركة خزينة، ${
          result.serials_returned
        } سيريال رجع للمخزون`,
      );
      if (!presetCustomerId) setCustomerId("");
      reset();
    } catch (e) {
      setPassword("");
      setError(e instanceof Error ? e.message : "حدث خطأ أثناء الحذف");
    }
  }

  const canSubmit =
    acknowledged &&
    confirmCode.trim() === customer?.code &&
    reason.trim() !== "" &&
    password !== "" &&
    !deleteMutation.isPending;

  return (
    <section
      className={`rounded-xl border-2 border-destructive/40 shadow-sm ${
        presetCustomerId ? "bg-card p-4" : "mt-8 bg-destructive/5 p-5"
      }`}
    >
      <h2 className="text-sm font-bold text-destructive">حذف عميل نهائيًا (للمالك بس)</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        بيمسح العميل وكل عقوده (أي حالة) وأقساطها وتحصيلاتها وضامنيه، وأثرها في الخزينة والقيود
        والشركاء، والأجهزة بترجع المخزون — كأنه ما اتدخلش، ومفيش رجوع. فواتير البيع النقدي بتفضل
        محفوظة من غير ربط بالعميل. كل حذف بيتسجل في سجل العمليات بكل اللي اتمسح.
      </p>

      {!presetCustomerId && (
        <label className="mt-3 block max-w-md space-y-1">
          <span className="text-xs font-medium text-foreground">العميل</span>
          <SearchPicker
            items={customers.map((c) => ({
              id: c.id,
              label: `${c.name} — ${c.code}${c.phone ? ` — ${c.phone}` : ""}`,
            }))}
            value={customerId}
            onChange={(id) => {
              setCustomerId(id);
              setError(null);
              setDone(null);
              reset();
            }}
            placeholder="ابحث بالاسم أو الكود..."
          />
        </label>
      )}

      {customer && (
        <div className="mt-3 space-y-2.5 rounded-lg border border-border bg-card p-3 text-sm">
          <p className="text-foreground">
            <span className="font-bold">{customer.name}</span> —{" "}
            <span dir="ltr" className="font-bold">
              {customer.code}
            </span>
            {customer.phone && (
              <>
                {" "}
                — <span dir="ltr">{customer.phone}</span>
              </>
            )}
          </p>
          <p className="text-xs text-muted-foreground">
            {customerContracts.length} عقد (ملغي {customerContracts.length - openContracts.length})
            · {receiptCount} إيصال تحصيل · {cashSalesCount} فاتورة نقدي (بتفضل محفوظة)
          </p>

          {(receiptCount > 0 || openContracts.length > 0) && (
            <p className="rounded-md bg-destructive/10 p-2.5 text-xs font-bold text-destructive">
              تحذير: {openContracts.length} عقد شغال و{receiptCount} إيصال بإجمالي{" "}
              {receivedTotal.toLocaleString("ar-EG")} ج.م — كله هيتمسح ويتشال من الخزينة والتقارير.
            </p>
          )}

          <label className="flex items-start gap-2 text-xs text-foreground">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5"
            />
            فاهم إن العميل وكل عقوده وتحصيلاته هيتمسحوا نهائيًا ومفيش رجوع.
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-foreground">سبب الحذف *</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="مثلًا: عميل اتسجل بالغلط مرتين"
              className="form-input"
            />
          </label>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">
                اكتب الكود للتأكيد (<span dir="ltr">{customer.code}</span>)
              </span>
              <input
                value={confirmCode}
                onChange={(e) => setConfirmCode(e.target.value)}
                className="form-input"
                dir="ltr"
                autoComplete="off"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium text-foreground">كلمة سر المالك</span>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="form-input"
                dir="ltr"
                autoComplete="current-password"
              />
            </label>
          </div>
        </div>
      )}
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      {done && <p className="mt-2 text-sm font-bold text-success">{done}</p>}
      {(customer || onClose) && (
        <div
          className={`mt-3 flex flex-wrap gap-2 ${
            presetCustomerId
              ? "sticky bottom-0 -mx-4 -mb-4 border-t border-border bg-card px-4 py-3"
              : ""
          }`}
        >
          {customer && (
            <button
              onClick={() => void handleDelete()}
              disabled={!canSubmit}
              className="rounded-md bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {deleteMutation.isPending ? "جارٍ الحذف..." : "حذف العميل نهائيًا"}
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
            >
              {done ? "تم — إغلاق" : "إلغاء"}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
