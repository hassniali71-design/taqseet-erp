/** بند 91 — «قسّط الباقي» من شاشة البيع الكاش: السلة والعميل والمدفوع بيتنقلوا لشاشة بيع التقسيط
 * كمقدّم، من غير ما البيّاع يكتبهم تاني. بيتشالوا من التاب ده بس (sessionStorage)، ولو التخزين مقفول
 * الشاشة بتفتح فاضية عادي. */
const KEY = "hesba-installment-handoff";

export interface InstallmentHandoff {
  customerId: string;
  downPayment: number;
  items: Array<{
    product_id: string;
    product_name: string;
    quantity: number;
    unit_price: number;
    serial_id?: string;
    serial_number?: string;
  }>;
}

export function saveInstallmentHandoff(h: InstallmentHandoff) {
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(h));
  } catch {
    /* التخزين مقفول — الشاشة هتفتح فاضية */
  }
}

/** بيقرا ويمسح (مرة واحدة بس). */
export function takeInstallmentHandoff(): InstallmentHandoff | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    window.sessionStorage.removeItem(KEY);
    if (!raw) return null;
    const h = JSON.parse(raw) as InstallmentHandoff;
    return Array.isArray(h.items) && h.items.length > 0 ? h : null;
  } catch {
    return null;
  }
}
