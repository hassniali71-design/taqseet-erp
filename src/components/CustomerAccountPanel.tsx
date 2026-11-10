/** بند 93 — «الحساب الجاري / جهاز العروسة» جوه صفحة العميل (مفتاح customer_accounts_enabled).
 * العربون فلوس العميل عندنا (أمانة 2100)، مش مكسب؛ البيع من رصيدها بيخصم من الأمانة من غير ما الخزنة
 * تتحرك؛ رد الفلوس بيرجّع من الأمانة والخزنة — القيود اللي وافق عليها المالك. */
import { useState } from "react";
import { toast } from "sonner";

import { DateInput } from "@/components/ui/DateInput";
import { SearchPicker } from "@/components/ui/SearchPicker";
import { daysUntil, reservedQty, summarizeAccount } from "@/lib/customer-account";
import { playSound } from "@/lib/sounds";
import {
  computeAccountBalance,
  computeProductStock,
  useCancelReservation,
  useCreateReservation,
  useCreateSale,
  useCurrentTenantSettings,
  useCustomerAccountCash,
  useCustomerAccountEntries,
  useCustomerAccounts,
  useInventoryMovements,
  useOpenCustomerAccount,
  useProducts,
  useProductSerials,
  useRecordPickups,
  useReservations,
  useSalePickups,
  useSales,
  useTreasuryAccounts,
  useTreasuryMovements,
  useUpdateCustomerAccount,
} from "@/lib/supabase-queries";
import { cn } from "@/lib/utils";
import type { Customer, Reservation } from "@/types";

const money = (n: number) => `${n.toLocaleString("ar-EG")} ج.م`;
type Mode = null | "deposit" | "refund" | "reserve" | "sell" | "pickup";

export function CustomerAccountPanel({
  tenantId,
  customer,
  actorUserId,
}: {
  tenantId: string;
  customer: Customer;
  actorUserId: string;
}) {
  const { data: accounts = [], isLoading } = useCustomerAccounts(tenantId);
  const { data: entries = [] } = useCustomerAccountEntries(tenantId);
  const { data: reservations = [] } = useReservations(tenantId);
  const { data: pickups = [] } = useSalePickups(tenantId);
  const { data: sales = [] } = useSales(tenantId);
  const { data: products = [] } = useProducts(tenantId);
  const { data: serials = [] } = useProductSerials(tenantId);
  const { data: stockMovements = [] } = useInventoryMovements(tenantId);
  const { data: treasuryAccounts = [] } = useTreasuryAccounts(tenantId);
  const { data: treasuryMovements = [] } = useTreasuryMovements(tenantId);
  const { data: settings } = useCurrentTenantSettings(tenantId);

  const openAccount = useOpenCustomerAccount(tenantId);
  const updateAccount = useUpdateCustomerAccount(tenantId);
  const cash = useCustomerAccountCash(tenantId);
  const createReservation = useCreateReservation(tenantId);
  const cancelReservation = useCancelReservation(tenantId);
  const createSale = useCreateSale(tenantId);
  const recordPickups = useRecordPickups(tenantId);

  const [mode, setMode] = useState<Mode>(null);
  const [kind, setKind] = useState<"bride" | "general">("bride");
  const [occasion, setOccasion] = useState("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [treasuryId, setTreasuryId] = useState("");
  const [productId, setProductId] = useState("");
  const [serialId, setSerialId] = useState("");
  const [qty, setQty] = useState("1");
  const [price, setPrice] = useState("");
  const [held, setHeld] = useState(true);
  const [pickupQty, setPickupQty] = useState<Record<string, string>>({});
  const [receivedBy, setReceivedBy] = useState("");
  const [converting, setConverting] = useState<Reservation | null>(null);

  const account = accounts.find((a) => a.customer_id === customer.id);
  const activeTreasuries = treasuryAccounts.filter((a) => a.active);
  const sellable = products.filter((p) => p.active);
  const product = sellable.find((p) => p.id === productId);

  function reset() {
    setMode(null);
    setAmount("");
    setReason("");
    setProductId("");
    setSerialId("");
    setQty("1");
    setPrice("");
    setHeld(true);
    setPickupQty({});
    setReceivedBy("");
    setConverting(null);
  }
  const fail = (e: Error) => {
    playSound("error");
    toast.error(e.message);
  };
  const done = (msg: string) => {
    playSound("done");
    toast.success(msg);
    reset();
  };

  if (isLoading) return <p className="text-sm text-muted-foreground">جارٍ التحميل...</p>;

  if (!account) {
    return (
      <div className="space-y-3 rounded-xl border border-dashed border-primary/60 p-4">
        <p className="text-sm text-muted-foreground">
          مفيش حساب جاري للعميل ده. افتحله حساب عشان يدفع عربون ويحجز ويشتري على دفعات.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex gap-2">
            {(
              [
                ["bride", "👰 جهاز عروسة"],
                ["general", "حساب جاري عادي"],
              ] as const
            ).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setKind(v)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-bold",
                  kind === v ? "bg-primary text-primary-foreground" : "border border-input",
                )}
              >
                {label}
              </button>
            ))}
          </div>
          {kind === "bride" && (
            <label className="block space-y-1">
              <span className="text-xs font-medium">ميعاد الفرح</span>
              <DateInput value={occasion} onChange={setOccasion} />
            </label>
          )}
          <button
            type="button"
            disabled={openAccount.isPending}
            onClick={() =>
              openAccount.mutate(
                {
                  customerId: customer.id,
                  kind,
                  ...(kind === "bride" && occasion && { occasionDate: occasion }),
                  actorUserId,
                },
                { onSuccess: () => done("اتفتح الحساب"), onError: fail },
              )
            }
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            افتح الحساب
          </button>
        </div>
      </div>
    );
  }

  const sum = summarizeAccount(account.id, entries, reservations, sales, pickups);
  const daysLeft = daysUntil(account.occasion_date);
  const ownEntries = entries.filter((e) => e.account_id === account.id);
  const available = product
    ? computeProductStock(product.id, product.serial_required, serials, stockMovements) -
      reservedQty(product.id, reservations, converting ? [converting.id] : [])
    : 0;
  const availableSerials = product?.serial_required
    ? serials.filter((s) => s.product_id === product.id && s.status === "available")
    : [];

  function submitCash(type: "deposit" | "refund") {
    if (!account) return;
    if (!treasuryId) return fail(new Error("اختار الخزنة"));
    cash.mutate(
      {
        accountId: account.id,
        type,
        amount: Number(amount) || 0,
        treasuryAccountId: treasuryId,
        ...(reason.trim() && { reason: reason.trim() }),
        customerName: customer.name,
        actorUserId,
      },
      {
        onSuccess: () => done(type === "deposit" ? "اتسجّل العربون" : "اترجّعت الفلوس"),
        onError: fail,
      },
    );
  }

  function submitReserve() {
    if (!account || !product) return fail(new Error("اختار الصنف"));
    const q = Number(qty);
    if (!Number.isInteger(q) || q <= 0) return fail(new Error("كمية غير صحيحة"));
    if (q > available) return fail(new Error(`المتاح ${available} بس`));
    createReservation.mutate(
      {
        accountId: account.id,
        productId: product.id,
        quantity: q,
        unitPrice: Number(price) || product.cash_price,
        actorUserId,
      },
      { onSuccess: () => done("اتحجز"), onError: fail },
    );
  }

  function submitSell() {
    if (!account || !product) return fail(new Error("اختار الصنف"));
    const q = product.serial_required ? 1 : Number(qty);
    if (!Number.isInteger(q) || q <= 0) return fail(new Error("كمية غير صحيحة"));
    if (product.serial_required && !serialId) return fail(new Error("اختار السيريال"));
    if (q > available) return fail(new Error(`المتاح ${available} بس`));
    const unitPrice = Number(price) || product.cash_price;
    createSale.mutate(
      {
        input: {
          customer_id: customer.id,
          items: [
            {
              product_id: product.id,
              quantity: q,
              unit_price: unitPrice,
              ...(product.serial_required && { serial_id: serialId }),
            },
          ],
          discount_pct: 0,
        },
        actorUserId,
        employeeDiscountLimitPct: settings?.employee_discount_limit_pct ?? 5,
        fromCustomerAccount: {
          accountId: account.id,
          held,
          ...(converting && { reservationIds: [converting.id] }),
        },
      },
      {
        onSuccess: () => done(held ? "اتباعت ومستنية في المحل" : "اتباعت واتسلمت"),
        onError: fail,
      },
    );
  }

  function startConvert(r: Reservation) {
    reset();
    setConverting(r);
    setProductId(r.product_id);
    setQty(String(r.quantity));
    setPrice(String(r.unit_price));
    setMode("sell");
  }

  function submitPickup() {
    if (!account) return;
    const lines = sum.pending
      .map((p) => ({
        saleId: p.saleId,
        productId: p.productId,
        quantity: Math.min(
          p.remaining,
          Math.floor(Number(pickupQty[`${p.saleId}:${p.productId}`]) || 0),
        ),
      }))
      .filter((l) => l.quantity > 0);
    recordPickups.mutate(
      { accountId: account.id, lines, ...(receivedBy.trim() && { receivedBy }), actorUserId },
      { onSuccess: () => done("اتسجّل التسليم"), onError: fail },
    );
  }

  function statementText() {
    const lines = [
      `${account?.kind === "bride" ? "👰 جهاز العروسة" : "الحساب الجاري"}: ${customer.name}`,
      ...(account?.occasion_date ? [`الفرح: ${account.occasion_date}`] : []),
      `دفعت: ${money(sum.deposited)}`,
      `اشترت بـ: ${money(sum.used)}`,
      ...(sum.refunded > 0 ? [`اترجّعلها: ${money(sum.refunded)}`] : []),
      `رصيدها عندنا: ${money(sum.balance)}`,
      ...(sum.activeReservations.length > 0
        ? [
            `محجوز ليها: ${money(sum.reservedValue)}${sum.stillOwed > 0 ? ` (لسه عليها ${money(sum.stillOwed)})` : ""}`,
          ]
        : []),
      ...(sum.pending.length > 0
        ? ["مستني في المحل:", ...sum.pending.map((p) => `- ${p.productName}: ${p.remaining}`)]
        : []),
      `استلمت: ${sum.deliveredQty} قطعة`,
    ];
    return lines.join("\n");
  }

  function printStatement() {
    const w = window.open("", "_blank");
    if (!w) return;
    w.document.write(
      `<html dir="rtl" lang="ar"><head><meta charset="utf-8"><title>كشف حساب ${customer.name}</title></head><body style="font-family:Arial;padding:24px;white-space:pre-line;font-size:16px">${statementText().replace(/</g, "&lt;")}</body></html>`,
    );
    w.document.close();
    w.print();
  }

  const phone = (customer.phone ?? "").replace(/\D/g, "").replace(/^0/, "20");

  return (
    <div className="space-y-4 rounded-xl border-2 border-primary/50 bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-base font-extrabold text-foreground">
          {account.kind === "bride" ? "👰 جهاز العروسة" : "💳 الحساب الجاري"}: {customer.name}
          {account.occasion_date && (
            <span className="mr-2 text-sm font-bold text-muted-foreground">
              — الفرح {new Date(`${account.occasion_date}T00:00:00`).toLocaleDateString("ar-EG")}
              {daysLeft !== null && daysLeft >= 0 && ` (باقي ${daysLeft} يوم)`}
            </span>
          )}
        </p>
        {account.kind === "bride" && (
          <label className="flex items-center gap-1 text-xs">
            <span>ميعاد الفرح</span>
            <DateInput
              value={account.occasion_date ?? ""}
              onChange={(v) =>
                updateAccount.mutate(
                  { accountId: account.id, patch: { occasion_date: v || null } },
                  { onError: fail },
                )
              }
            />
          </label>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {(
          [
            ["دفعت (عربون)", money(sum.deposited)],
            ["اتسحب منه", money(sum.used + sum.refunded)],
            ["رصيدها عندنا", money(sum.balance)],
            [
              "محجوز ليها",
              `${money(sum.reservedValue)}${sum.stillOwed > 0 ? ` (لسه عليها ${money(sum.stillOwed)})` : ""}`,
            ],
            [
              "اشترته ومستني",
              `${sum.pending.reduce((s, p) => s + p.remaining, 0)} قطعة (في المحل)`,
            ],
            ["استلمته", `${sum.deliveredQty} قطعة`],
          ] as const
        ).map(([label, v]) => (
          <div key={label} className="rounded-lg border border-border p-2">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-0.5 text-sm font-extrabold text-foreground">{v}</p>
          </div>
        ))}
      </div>

      {sum.oldReservations.length > 0 && (
        <p className="rounded-md bg-warning/15 p-2 text-sm font-bold text-warning">
          ⚠️ فيه {sum.oldReservations.length} حجز عدّى عليه أكتر من 60 يوم — كلّمها.
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {(
          [
            ["deposit", "+ دفعت فلوس"],
            ["reserve", "+ احجز صنف"],
            ["sell", "+ بيع من رصيدها"],
            ["pickup", "📦 تسليم"],
            ["refund", "↩ رد فلوس"],
          ] as const
        ).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => {
              reset();
              setMode(m);
            }}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-bold",
              mode === m
                ? "bg-primary text-primary-foreground"
                : "border border-input hover:bg-accent",
            )}
          >
            {label}
          </button>
        ))}
        <button
          type="button"
          onClick={printStatement}
          className="rounded-md border border-input px-3 py-1.5 text-sm font-bold"
        >
          🖨 كشف حساب
        </button>
        {phone.length >= 11 && (
          <a
            href={`https://wa.me/${phone}?text=${encodeURIComponent(statementText())}`}
            target="_blank"
            rel="noreferrer"
            className="rounded-md border border-input px-3 py-1.5 text-sm font-bold"
          >
            واتساب
          </a>
        )}
      </div>

      {(mode === "deposit" || mode === "refund") && (
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-border p-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">
              {mode === "deposit" ? "المبلغ اللي دفعته" : "المبلغ اللي هيرجعلها"}
            </span>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="form-input w-36"
              dir="ltr"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">الخزنة</span>
            <select
              value={treasuryId}
              onChange={(e) => setTreasuryId(e.target.value)}
              className="form-input"
            >
              <option value="">اختار</option>
              {activeTreasuries.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} — {money(computeAccountBalance(a.id, treasuryMovements))}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">ملاحظة (اختياري)</span>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="form-input"
            />
          </label>
          <button
            type="button"
            disabled={cash.isPending}
            onClick={() => submitCash(mode)}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {mode === "deposit" ? "سجّل العربون" : "رجّع الفلوس"}
          </button>
          {mode === "refund" && (
            <p className="w-full text-xs text-muted-foreground">
              أقصى حاجة رصيدها: {money(sum.balance)}. لو فيه خصم، رجّع الباقي وسجّل الخصم
              كإيراد/مصروف بسبب.
            </p>
          )}
        </div>
      )}

      {(mode === "reserve" || mode === "sell") && (
        <div className="space-y-3 rounded-lg border border-border p-3">
          {converting && (
            <p className="text-sm font-bold text-primary">
              تحويل حجز لبيع من رصيدها — بالسعر المتثبت وقت الحجز.
            </p>
          )}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
            <label className="block space-y-1 sm:col-span-2">
              <span className="text-xs font-medium">الصنف</span>
              {converting ? (
                <p className="form-input">{product?.name}</p>
              ) : (
                <SearchPicker
                  items={sellable.map((p) => ({ id: p.id, label: p.name }))}
                  value={productId}
                  onChange={(id) => {
                    setProductId(id);
                    setSerialId("");
                    const p = sellable.find((x) => x.id === id);
                    setPrice(p ? String(p.cash_price) : "");
                  }}
                  placeholder="بحث باسم الصنف..."
                />
              )}
            </label>
            {mode === "sell" && product?.serial_required ? (
              <label className="block space-y-1">
                <span className="text-xs font-medium">السيريال</span>
                <select
                  value={serialId}
                  onChange={(e) => setSerialId(e.target.value)}
                  className="form-input"
                >
                  <option value="">اختار</option>
                  {availableSerials.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.serial_number}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <label className="block space-y-1">
                <span className="text-xs font-medium">
                  الكمية {product && `(متاح ${available})`}
                </span>
                <input
                  type="number"
                  min="1"
                  value={qty}
                  disabled={Boolean(converting)}
                  onChange={(e) => setQty(e.target.value)}
                  className="form-input"
                  dir="ltr"
                />
              </label>
            )}
            <label className="block space-y-1">
              <span className="text-xs font-medium">سعر القطعة</span>
              <input
                type="number"
                min="0"
                value={price}
                disabled={Boolean(converting)}
                onChange={(e) => setPrice(e.target.value)}
                className="form-input"
                dir="ltr"
              />
            </label>
          </div>
          {mode === "sell" && (
            <div className="flex flex-wrap gap-2">
              {(
                [
                  [true, "تسيبها في المحل لحد الفرح"],
                  [false, "هتاخدها دلوقتي"],
                ] as const
              ).map(([v, label]) => (
                <button
                  key={label}
                  type="button"
                  onClick={() => setHeld(v)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-bold",
                    held === v ? "bg-primary text-primary-foreground" : "border border-input",
                  )}
                >
                  {label}
                </button>
              ))}
              <span className="self-center text-xs text-muted-foreground">
                الإجمالي{" "}
                {money((Number(price) || 0) * (product?.serial_required ? 1 : Number(qty) || 0))} —
                رصيدها {money(sum.balance)}
              </span>
            </div>
          )}
          <button
            type="button"
            disabled={createReservation.isPending || createSale.isPending}
            onClick={mode === "reserve" ? submitReserve : submitSell}
            className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
          >
            {mode === "reserve" ? "احجز" : createSale.isPending ? "جارٍ البيع..." : "بيع من رصيدها"}
          </button>
        </div>
      )}

      {mode === "pickup" && (
        <div className="space-y-2 rounded-lg border border-border p-3">
          {sum.pending.length === 0 ? (
            <p className="text-sm text-muted-foreground">مفيش حاجة مستنية في المحل.</p>
          ) : (
            <>
              {sum.pending.map((p) => (
                <label
                  key={`${p.saleId}:${p.productId}`}
                  className="flex items-center gap-2 text-sm"
                >
                  <span className="flex-1">
                    {p.productName}{" "}
                    <span className="text-xs text-muted-foreground">
                      ({p.invoiceNumber} — باقي {p.remaining})
                    </span>
                  </span>
                  <input
                    type="number"
                    min="0"
                    max={p.remaining}
                    value={pickupQty[`${p.saleId}:${p.productId}`] ?? ""}
                    onChange={(e) =>
                      setPickupQty({ ...pickupQty, [`${p.saleId}:${p.productId}`]: e.target.value })
                    }
                    placeholder="0"
                    className="form-input w-20"
                    dir="ltr"
                  />
                </label>
              ))}
              <input
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                placeholder="مين استلم؟ (اختياري)"
                className="form-input max-w-xs"
              />
              <button
                type="button"
                disabled={recordPickups.isPending}
                onClick={submitPickup}
                className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                سجّل التسليم
              </button>
            </>
          )}
        </div>
      )}

      {sum.activeReservations.length > 0 && (
        <div>
          <p className="text-sm font-bold">المحجوز</p>
          <ul className="mt-1 space-y-1">
            {sum.activeReservations.map((r) => (
              <li
                key={r.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border px-2 py-1 text-sm"
              >
                <span className="flex-1">
                  {products.find((p) => p.id === r.product_id)?.name} × {r.quantity} —{" "}
                  <span dir="ltr">{money(Number(r.unit_price) * r.quantity)}</span>
                  <span className="mr-2 text-xs text-muted-foreground">
                    من {new Date(r.created_at).toLocaleDateString("ar-EG")}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() => startConvert(r)}
                  className="text-xs font-bold text-primary hover:underline"
                >
                  حوّل لبيع
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (!window.confirm("تلغي الحجز؟ الكمية هترجع للمتاح.")) return;
                    cancelReservation.mutate(
                      { reservationId: r.id, actorUserId },
                      { onSuccess: () => done("اتلغى الحجز"), onError: fail },
                    );
                  }}
                  className="text-xs font-bold text-destructive hover:underline"
                >
                  إلغاء
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {ownEntries.length > 0 && (
        <div>
          <p className="text-sm font-bold">الحركات</p>
          <ul className="mt-1 max-h-48 space-y-0.5 overflow-y-auto text-xs text-muted-foreground">
            {ownEntries.map((e) => (
              <li key={e.id}>
                {new Date(e.created_at).toLocaleDateString("ar-EG")} —{" "}
                {e.type === "deposit"
                  ? "دفعت"
                  : e.type === "use"
                    ? e.held
                      ? "اشترت (في المحل)"
                      : "اشترت واستلمت"
                    : "اترجّعلها"}{" "}
                <span dir="ltr">{money(Number(e.amount))}</span>
                {e.reason && ` — ${e.reason}`}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
