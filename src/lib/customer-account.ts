/** بند 93 — حسابات للعرض بس للحساب الجاري / جهاز العروسة (مفيش رقم بيتخزّن غير الدفتر نفسه). */
import type { CustomerAccountEntry, Reservation, Sale, SalePickup } from "@/types";

const r2 = (n: number) => Math.round(n * 100) / 100;

export interface PendingPickup {
  saleId: string;
  invoiceNumber: string;
  productId: string;
  productName: string;
  remaining: number;
}

export interface AccountSummary {
  deposited: number;
  used: number;
  refunded: number;
  balance: number;
  reservedValue: number;
  /** المحجوز ناقص الرصيد (لو موجب = لسه عليها). */
  stillOwed: number;
  activeReservations: Reservation[];
  oldReservations: Reservation[];
  pending: PendingPickup[];
  deliveredQty: number;
}

export function summarizeAccount(
  accountId: string,
  entries: CustomerAccountEntry[],
  reservations: Reservation[],
  sales: Sale[],
  pickups: SalePickup[],
  now: Date = new Date(),
): AccountSummary {
  const own = entries.filter((e) => e.account_id === accountId);
  const sum = (t: CustomerAccountEntry["type"]) =>
    r2(own.filter((e) => e.type === t).reduce((s, e) => s + Number(e.amount), 0));
  const deposited = sum("deposit");
  const used = sum("use");
  const refunded = sum("refund");
  const balance = r2(deposited - used - refunded);

  const activeReservations = reservations.filter(
    (r) => r.account_id === accountId && r.status === "active",
  );
  const reservedValue = r2(
    activeReservations.reduce((s, r) => s + Number(r.unit_price) * r.quantity, 0),
  );
  const sixtyDays = 60 * 24 * 3600 * 1000;
  const oldReservations = activeReservations.filter(
    (r) => now.getTime() - new Date(r.created_at).getTime() > sixtyDays,
  );

  const ownPickups = pickups.filter((p) => p.account_id === accountId);
  const pending: PendingPickup[] = [];
  for (const e of own.filter((x) => x.type === "use" && x.held && x.sale_id)) {
    const sale = sales.find((s) => s.id === e.sale_id);
    if (!sale || sale.status !== "completed") continue;
    const qtyByProduct = new Map<string, { name: string; qty: number }>();
    for (const item of sale.items ?? []) {
      const cur = qtyByProduct.get(item.product_id) ?? { name: item.product_name, qty: 0 };
      cur.qty += item.quantity;
      qtyByProduct.set(item.product_id, cur);
    }
    for (const [productId, { name, qty }] of qtyByProduct) {
      const picked = ownPickups
        .filter((p) => p.sale_id === sale.id && p.product_id === productId)
        .reduce((s, p) => s + p.quantity, 0);
      if (qty - picked > 0) {
        pending.push({
          saleId: sale.id,
          invoiceNumber: sale.invoice_number,
          productId,
          productName: name,
          remaining: qty - picked,
        });
      }
    }
  }
  const deliveredQty = ownPickups.reduce((s, p) => s + p.quantity, 0);

  return {
    deposited,
    used,
    refunded,
    balance,
    reservedValue,
    stillOwed: r2(Math.max(0, reservedValue - balance)),
    activeReservations,
    oldReservations,
    pending,
    deliveredQty,
  };
}

/** الكمية المحجوزة من صنف (كل الحسابات) — «المتاح للبيع» = المخزون − ده، في محل الحساب الجاري بس. */
export function reservedQty(
  productId: string,
  reservations: Reservation[],
  exceptIds: string[] = [],
) {
  return reservations
    .filter((r) => r.product_id === productId && r.status === "active" && !exceptIds.includes(r.id))
    .reduce((s, r) => s + r.quantity, 0);
}

export function daysUntil(dateStr: string | null, now: Date = new Date()): number | null {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((d.getTime() - today.getTime()) / (24 * 3600 * 1000));
}
