/** بند 89 — البيع والشراء بالوحدة الأكبر (الدستة/الكرتونة) للأدوات المنزلية. المخزون دايمًا بالقطعة
 * (ملف 0035)، والوحدة الأكبر بس بتحوّل الكمية والسعر وقت البيع والشراء. صنف من غير وحدات = زي
 * النهارده بالظبط (وحدة واحدة بمعامل 1). */
import type { Product, ProductUnit } from "@/types";

export interface UnitOption {
  /** "" = الوحدة الأساسية (القطعة). */
  id: string;
  name: string;
  factor: number;
  cashPrice: number;
  costPrice: number;
}

export function unitOptionsFor(product: Product | undefined, units: ProductUnit[]): UnitOption[] {
  if (!product) return [];
  const base: UnitOption = {
    id: "",
    name: product.unit || "قطعة",
    factor: 1,
    cashPrice: product.cash_price,
    costPrice: product.cost_price,
  };
  const extra = units
    .filter((u) => u.product_id === product.id && u.factor > 1)
    .sort((a, b) => a.factor - b.factor)
    .map((u) => ({
      id: u.id,
      name: u.name,
      factor: Number(u.factor),
      cashPrice:
        u.cash_price != null
          ? Number(u.cash_price)
          : Math.round(product.cash_price * u.factor * 100) / 100,
      costPrice:
        u.cost_price != null
          ? Number(u.cost_price)
          : Math.round(product.cost_price * u.factor * 100) / 100,
    }));
  return [base, ...extra];
}

/** «5 دستة (60 قطعة)» أو الرقم بس لو مفيش وحدة أكبر. */
export function unitQtyLabel(line: { quantity: number; unit_name?: string; unit_qty?: number }) {
  return line.unit_name && line.unit_qty
    ? `${line.unit_qty} ${line.unit_name} (${line.quantity})`
    : String(line.quantity);
}
