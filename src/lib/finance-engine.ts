/**
 * §37 Installment Finance Formula + §41 Installment Schedule — pure functions, no I/O, no
 * dependency on data-store.ts. Verified against the spec's own acceptance test (§128) in
 * scripts/verify-finance-engine.ts. Do not inline this math anywhere else — every installment
 * contract creation must go through these two functions.
 */

export interface FinanceResult {
  financeAmount: number;
  totalAmount: number;
}

/**
 * Finance Amount = Principal × Plan Rate — applied once to the principal, never compounded
 * monthly. `principal` here is already `cash_subtotal - down_payment` (the financed base),
 * not the item's full price.
 */
export function calculateFinance(principal: number, ratePct: number): FinanceResult {
  const financeAmount = round2(principal * (ratePct / 100));
  const totalAmount = round2(principal + financeAmount);
  return { financeAmount, totalAmount };
}

export interface ScheduleLine {
  seq: number;
  due_date: string;
  amount: number;
}

/**
 * Fixed day-of-month due dates, one month apart, starting one month after `startDate`
 * (§41's example: purchase 10/09 → due dates 10/10, 10/11, 10/12...). The last installment
 * absorbs the rounding remainder so the schedule always sums to exactly `totalAmount`.
 */
export function generateSchedule(
  totalAmount: number,
  durationMonths: number,
  startDate: Date = new Date(),
): ScheduleLine[] {
  if (durationMonths <= 0) throw new Error("مدة التقسيط يجب أن تكون أكبر من صفر");
  const base = Math.floor((totalAmount / durationMonths) * 100) / 100;
  const lines: ScheduleLine[] = [];
  let allocated = 0;
  for (let i = 1; i <= durationMonths; i++) {
    const due = new Date(startDate);
    due.setMonth(due.getMonth() + i);
    const isLast = i === durationMonths;
    const amount = isLast ? round2(totalAmount - allocated) : base;
    allocated = round2(allocated + amount);
    lines.push({ seq: i, due_date: due.toISOString(), amount });
  }
  return lines;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}
