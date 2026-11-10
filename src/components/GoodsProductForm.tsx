/** فورم «أدوات منزلية» القصير (بند 86 — TASK-0005 المرحلة 1). بيظهر بس في محل مفتاح الأدوات عنده
 * مفتوح. من غير سيريال ولا ضمان ولا موديل: اسم، وقسم، ووحدة، وسعرين، وكمية — والصنف يتسجّل في
 * 3–5 خطوات.
 *
 * الوحدات: المخزون دايمًا بأصغر وحدة. لو اختار «دستة» أو «كرتونة» بيكتب الأسعار والكمية بالدستة زي
 * ما بيشتري، والبرنامج بيحوّل: الصنف بيتسجّل بالقطعة، والدستة وحدة أكبر بسعرها (ملف 0035).
 * «نفس الصنف بأحجام تانية»: اسم واحد + جدول أحجام (3، 6، 12) ← صنف لكل حجم، كل واحد طقم مقفول. */
import { useState, type FormEvent } from "react";

import { playSound } from "@/lib/sounds";
import { similarNames } from "@/lib/text-filter";
import type { NewGoodsItem } from "@/lib/supabase-queries";
import { cn } from "@/lib/utils";

const UNITS = ["قطعة", "دستة", "طقم", "كرتونة", "علبة"] as const;
/** وحدات «عبوة» بتتكوّن من قطع — الباقي وحدة أساسية لوحدها. */
const PACK_DEFAULT_FACTOR: Record<string, string> = { دستة: "12", كرتونة: "" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (s: string) => {
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
};

type SizeRow = { size: string; cost: string; cash: string; qty: string };

export function GoodsProductForm({
  categories,
  existingNames,
  markupPct,
  saving,
  onSave,
  onCancel,
}: {
  categories: string[];
  existingNames: string[];
  /** نسبة الربح المقترحة من إعدادات المحل (0 = مفيش اقتراح). */
  markupPct: number;
  saving: boolean;
  onSave: (items: NewGoodsItem[]) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState<string>("قطعة");
  const [factor, setFactor] = useState("12");
  const [cost, setCost] = useState("");
  const [cash, setCash] = useState("");
  const [cashTouched, setCashTouched] = useState(false);
  const [qty, setQty] = useState("");
  const [minStock, setMinStock] = useState("");
  const [barcode, setBarcode] = useState("");
  const [sizesMode, setSizesMode] = useState(false);
  const [sizes, setSizes] = useState<SizeRow[]>([
    { size: "3", cost: "", cash: "", qty: "" },
    { size: "6", cost: "", cash: "", qty: "" },
    { size: "12", cost: "", cash: "", qty: "" },
  ]);
  const [error, setError] = useState<string | null>(null);

  const isPack = unit in PACK_DEFAULT_FACTOR;
  const suggest = (c: string) =>
    markupPct > 0 && num(c) > 0 ? String(r2(num(c) * (1 + markupPct / 100))) : "";
  const similar = name.trim().length >= 2 ? similarNames(name, existingNames) : [];

  function buildItems(): NewGoodsItem[] {
    const base = {
      ...(category.trim() && { category: category.trim() }),
      // الباركود لصنف واحد بس — مينفعش يتكرر على كل الأحجام
      ...(!sizesMode && barcode.trim() && { barcode: barcode.trim() }),
    };
    if (sizesMode) {
      const rows = sizes.filter((r) => num(r.size) > 0 && num(r.cash) > 0);
      if (rows.length === 0) throw new Error("اكتب حجم وسعر بيع لحجم واحد على الأقل");
      return rows.map((r) => ({
        ...base,
        name: `${name.trim()} — ${num(r.size)} ${num(r.size) >= 11 ? "قطعة" : "قطع"}`,
        unit: "طقم",
        cost_price: num(r.cost),
        cash_price: num(r.cash),
        opening_qty: Math.max(0, Math.floor(num(r.qty))),
        min_stock: Math.max(0, Math.floor(num(minStock))),
      }));
    }
    if (num(cash) <= 0) throw new Error("اكتب سعر البيع");
    if (isPack) {
      const f = Math.floor(num(factor));
      if (f < 2) throw new Error(`ال${unit} فيها كام قطعة؟`);
      return [
        {
          ...base,
          name: name.trim(),
          unit: "قطعة",
          cost_price: r2(num(cost) / f),
          cash_price: r2(num(cash) / f),
          opening_qty: Math.max(0, Math.floor(num(qty) * f)),
          min_stock: Math.max(0, Math.floor(num(minStock) * f)),
          units: [{ name: unit, factor: f, cost_price: num(cost), cash_price: num(cash) }],
        },
      ];
    }
    return [
      {
        ...base,
        name: name.trim(),
        unit,
        cost_price: num(cost),
        cash_price: num(cash),
        opening_qty: Math.max(0, Math.floor(num(qty))),
        min_stock: Math.max(0, Math.floor(num(minStock))),
      },
    ];
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("اكتب اسم الصنف");
      playSound("error");
      return;
    }
    try {
      onSave(buildItems());
    } catch (err) {
      setError(err instanceof Error ? err.message : "حدث خطأ");
      playSound("error");
    }
  }

  const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

  return (
    <form
      onSubmit={submit}
      className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm"
    >
      <h2 className="text-sm font-bold text-foreground">🍽️ صنف أدوات منزلية جديد</h2>

      <label className="block space-y-1">
        <span className="text-xs font-medium">اسم الصنف *</span>
        <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={input} />
        {similar.length > 0 && (
          <span className="block text-xs font-medium text-warning">
            فيه صنف اسمه «{similar.join("»، «")}» — هو ده؟ لو صنف تاني كمّل عادي.
          </span>
        )}
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium">القسم</span>
        <input
          list="goods-categories"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="مطبخ، أطقم، بلاستيك، حلل، أدوات تقديم..."
          className={input}
        />
        <datalist id="goods-categories">
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </label>

      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={sizesMode}
          onChange={(e) => setSizesMode(e.target.checked)}
          className="h-4 w-4 accent-primary"
        />
        نفس الصنف بأحجام تانية (طقم 3 / 6 / 12...)
      </label>

      {sizesMode ? (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            هيتعمل صنف لكل حجم، كل واحد طقم بيتباع مقفول. سيب السطر فاضي لو الحجم ده مش عندك.
          </p>
          <table className="keep-table w-full text-sm">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="p-1 text-right font-medium">عدد القطع</th>
                <th className="p-1 text-right font-medium">سعر الشراء</th>
                <th className="p-1 text-right font-medium">سعر البيع</th>
                <th className="p-1 text-right font-medium">الكمية</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {sizes.map((r, i) => {
                const set = (patch: Partial<SizeRow>) =>
                  setSizes((prev) => prev.map((x, j) => (j === i ? { ...x, ...patch } : x)));
                return (
                  <tr key={i}>
                    {(["size", "cost", "cash", "qty"] as const).map((k) => (
                      <td key={k} className="p-1">
                        <input
                          type="number"
                          min="0"
                          step={k === "cost" || k === "cash" ? "0.01" : "1"}
                          value={r[k]}
                          onChange={(e) =>
                            set(
                              k === "cost" && !r.cash
                                ? { cost: e.target.value }
                                : { [k]: e.target.value },
                            )
                          }
                          onBlur={() =>
                            k === "cost" &&
                            !r.cash &&
                            suggest(r.cost) &&
                            set({ cash: suggest(r.cost) })
                          }
                          className={input}
                          dir="ltr"
                        />
                      </td>
                    ))}
                    <td className="p-1">
                      <button
                        type="button"
                        onClick={() => setSizes((prev) => prev.filter((_, j) => j !== i))}
                        className="rounded px-2 py-1 text-xs text-destructive hover:bg-destructive/10"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <button
            type="button"
            onClick={() => setSizes((prev) => [...prev, { size: "", cost: "", cash: "", qty: "" }])}
            className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
          >
            + حجم تاني
          </button>
        </div>
      ) : (
        <>
          <div className="space-y-1">
            <span className="text-xs font-medium">بتشتري وبتبيع بـ</span>
            <div className="flex flex-wrap gap-2">
              {UNITS.map((u) => (
                <button
                  key={u}
                  type="button"
                  onClick={() => {
                    setUnit(u);
                    if (u in PACK_DEFAULT_FACTOR) setFactor(PACK_DEFAULT_FACTOR[u] ?? "");
                  }}
                  className={cn(
                    "rounded-md border px-4 py-2 text-sm font-bold",
                    unit === u
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-input hover:bg-accent",
                  )}
                >
                  {u}
                </button>
              ))}
            </div>
            {isPack && (
              <label className="mt-2 flex items-center gap-2 text-sm">
                ال{unit} فيها كام قطعة؟
                <input
                  type="number"
                  min="2"
                  value={factor}
                  onChange={(e) => setFactor(e.target.value)}
                  className="w-24 rounded-md border border-input bg-background px-3 py-2 text-sm"
                  dir="ltr"
                />
              </label>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium">سعر الشراء لل{unit}</span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cost}
                onChange={(e) => {
                  setCost(e.target.value);
                  if (!cashTouched) setCash(suggest(e.target.value));
                }}
                className={input}
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">
                سعر البيع (كاش) لل{unit} *
                {markupPct > 0 && !cashTouched && " — مقترح +" + markupPct + "%"}
              </span>
              <input
                type="number"
                min="0"
                step="0.01"
                value={cash}
                onChange={(e) => {
                  setCash(e.target.value);
                  setCashTouched(true);
                }}
                className={input}
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">الكمية اللي في المحل دلوقتي ({unit})</span>
              <input
                type="number"
                min="0"
                value={qty}
                onChange={(e) => setQty(e.target.value)}
                className={input}
                dir="ltr"
              />
            </label>
            <label className="block space-y-1">
              <span className="text-xs font-medium">نبّهني لو قلّ عن ({unit}) — اختياري</span>
              <input
                type="number"
                min="0"
                value={minStock}
                onChange={(e) => setMinStock(e.target.value)}
                className={input}
                dir="ltr"
              />
            </label>
          </div>
          {isPack && num(factor) >= 2 && num(cash) > 0 && (
            <p className="text-xs text-muted-foreground">
              القطعة الواحدة = {r2(num(cash) / Math.floor(num(factor)))} ج.م، والمخزون هيتسجّل{" "}
              {Math.floor(num(qty) * Math.floor(num(factor))) || 0} قطعة. وتقدر تبيع بالقطعة أو بال
              {unit}.
            </p>
          )}
        </>
      )}

      {!sizesMode && (
        <label className="block space-y-1">
          <span className="text-xs font-medium">الباركود (اختياري)</span>
          <input
            value={barcode}
            onChange={(e) => setBarcode(e.target.value)}
            className={input}
            dir="ltr"
          />
        </label>
      )}

      {error && <p className="text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
        >
          {saving ? "جارٍ الحفظ..." : sizesMode ? "احفظ الأحجام" : "احفظ الصنف"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-accent"
        >
          إلغاء
        </button>
      </div>
    </form>
  );
}
