/** بند 88 — رفع بضاعة الأدوات المنزلية من شيت إكسيل. الشيت الفاضي في
 * `public/templates/goods-template.xlsx` (بيتعمل بـ scripts/make-goods-template.ts من نفس العواميد دي).
 *
 * نفس قواعد فورم الأدوات (GoodsProductForm): الدستة/الكرتونة بتتحوّل لقطعة + وحدة أكبر بسعرها، والأسعار
 * والكمية في الشيت بالوحدة اللي المحل كاتبها. الحفظ نفسه بـ create_goods_products (يا كله يا ولا حاجة). */
import { normalizeArabic, similarNames } from "@/lib/text-filter";
import type { NewGoodsItem } from "@/lib/supabase-queries";

export const GOODS_SHEET_COLUMNS = [
  { key: "name", title: "اسم الصنف *", match: ["اسم"], required: true, width: 28 },
  { key: "category", title: "القسم", match: ["قسم", "فئه"], width: 14 },
  { key: "unit", title: "الوحدة (قطعة/دستة/طقم/كرتونة/علبة)", match: ["وحده"], width: 18 },
  {
    key: "factor",
    title: "عدد القطع في الوحدة (للدستة والكرتونة)",
    match: ["عدد القطع"],
    width: 18,
  },
  { key: "cost", title: "سعر الشراء (للوحدة)", match: ["شراء", "تكلفه"], width: 14 },
  { key: "cash", title: "سعر البيع (للوحدة) *", match: ["بيع"], required: true, width: 14 },
  { key: "qty", title: "الكمية (بالوحدة)", match: ["كميه"], width: 12 },
  { key: "min", title: "أقل كمية للتنبيه", match: ["اقل", "تنبيه"], width: 12 },
  { key: "barcode", title: "الباركود (اختياري)", match: ["باركود"], width: 18 },
] as const;

type ColKey = (typeof GOODS_SHEET_COLUMNS)[number]["key"];

export const GOODS_UNITS = ["قطعة", "دستة", "طقم", "كرتونة", "علبة"] as const;
const PACK_DEFAULT_FACTOR: Record<string, number | null> = { دستة: 12, كرتونة: null };
export const MAX_GOODS_ROWS = 500;
export const GOODS_TEMPLATE_URL = "/templates/goods-template.xlsx";

export interface GoodsSheetRow {
  line: number;
  name: string;
  unit: string;
  cash: number;
  qty: number;
  error?: string;
  warning?: string;
  item?: NewGoodsItem;
}

const r2 = (n: number) => Math.round(n * 100) / 100;
const norm = (s: string) => normalizeArabic(s.trim().toLowerCase());

/** أرقام عربي (٠١٢) أو فاصلة عشرية عربي أو "150 ج" → رقم. فاضي = null. */
export function sheetNumber(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : NaN;
  const s = String(v)
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0))
    .replace(/[٫,]/g, ".")
    .replace(/[^\d.-]/g, "");
  if (s === "") return NaN;
  const n = Number(s);
  return Number.isFinite(n) ? n : NaN;
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

// العواميد اللي اسمها فيه كلمة من عمود تاني بتتطابق الأول («عدد القطع في الوحدة» فيها «الوحدة»،
// و«أقل كمية» فيها «كمية»).
const MATCH_ORDER = [...GOODS_SHEET_COLUMNS].sort(
  (a, b) =>
    Number(b.key === "factor" || b.key === "min") - Number(a.key === "factor" || a.key === "min"),
);

/** بيلاقي كل عمود فين في السطر الأول، حتى لو المحل غيّر ترتيبهم أو كتب الاسم مختصر. */
function mapHeader(header: unknown[]): Map<ColKey, number> | string {
  const out = new Map<ColKey, number>();
  header.forEach((h, idx) => {
    const t = norm(cellText(h));
    if (!t) return;
    for (const col of MATCH_ORDER) {
      if (!out.has(col.key) && col.match.some((m) => t.includes(norm(m)))) {
        out.set(col.key, idx);
        break;
      }
    }
  });
  if (!out.has("name") || !out.has("cash")) {
    return "مش لاقي عمود «اسم الصنف» أو «سعر البيع» في أول سطر — استخدم الشيت اللي من البرنامج";
  }
  return out;
}

export function parseGoodsSheet(
  rows: unknown[][],
  existingNames: string[],
): { rows: GoodsSheetRow[]; error?: string } {
  const header = rows[0];
  if (!header) return { rows: [], error: "الشيت فاضي" };
  const cols = mapHeader(header);
  if (typeof cols === "string") return { rows: [], error: cols };
  const get = (r: unknown[], k: ColKey) => {
    const i = cols.get(k);
    return i === undefined ? undefined : r[i];
  };

  const seen = new Map<string, number>();
  const out: GoodsSheetRow[] = [];
  rows.slice(1).forEach((r, i) => {
    const line = i + 2;
    if (!r || r.every((c) => cellText(c) === "")) return; // سطر فاضي
    const name = cellText(get(r, "name"));
    const unitRaw = cellText(get(r, "unit"));
    const unit = GOODS_UNITS.find((u) => norm(u) === norm(unitRaw)) ?? (unitRaw ? unitRaw : "قطعة");
    const cash = sheetNumber(get(r, "cash"));
    const cost = sheetNumber(get(r, "cost"));
    const qty = sheetNumber(get(r, "qty"));
    const min = sheetNumber(get(r, "min"));
    const factorIn = sheetNumber(get(r, "factor"));
    const row: GoodsSheetRow = { line, name, unit, cash: cash ?? 0, qty: qty ?? 0 };
    out.push(row);

    if (!name) return void (row.error = "مفيش اسم");
    if (cash === null || Number.isNaN(cash) || cash <= 0)
      return void (row.error = "سعر البيع مش مكتوب صح");
    if (cost !== null && (Number.isNaN(cost) || cost < 0))
      return void (row.error = "سعر الشراء مش رقم");
    if (qty !== null && (Number.isNaN(qty) || qty < 0)) return void (row.error = "الكمية مش رقم");
    if (min !== null && (Number.isNaN(min) || min < 0)) return void (row.error = "أقل كمية مش رقم");
    if (!GOODS_UNITS.some((u) => u === unit)) {
      return void (row.error = `الوحدة «${unitRaw}» مش معروفة — اكتب: ${GOODS_UNITS.join(" / ")}`);
    }

    const key = norm(name);
    const dupLine = seen.get(key);
    if (dupLine !== undefined) return void (row.error = `مكرر — نفس اسم سطر ${dupLine}`);
    seen.set(key, line);
    const similar = similarNames(name, existingNames, 1);
    if (similar[0]) row.warning = `قريب من صنف موجود: «${similar[0]}»`;

    const category = cellText(get(r, "category"));
    const barcode = cellText(get(r, "barcode"));
    const base = {
      name,
      ...(category && { category }),
      ...(barcode && { barcode }),
    };
    const costN = cost ?? 0;
    const qtyN = Math.floor(qty ?? 0);
    const minN = Math.floor(min ?? 0);

    if (unit in PACK_DEFAULT_FACTOR) {
      const f = Math.floor(
        factorIn !== null && !Number.isNaN(factorIn) ? factorIn : (PACK_DEFAULT_FACTOR[unit] ?? 0),
      );
      if (f < 2) return void (row.error = `ال${unit} فيها كام قطعة؟ اكتبها في عمود «عدد القطع»`);
      row.item = {
        ...base,
        unit: "قطعة",
        cost_price: r2(costN / f),
        cash_price: r2(cash / f),
        opening_qty: qtyN * f,
        min_stock: minN * f,
        units: [{ name: unit, factor: f, cost_price: costN, cash_price: cash }],
      };
    } else {
      row.item = {
        ...base,
        unit,
        cost_price: costN,
        cash_price: cash,
        opening_qty: qtyN,
        min_stock: minN,
      };
    }
  });
  return { rows: out };
}
