/** بند 88 — «ارفع شيت إكسيل» للأدوات المنزلية: يختار الملف ← البرنامج يقراه ويعرض كل سطر (سليم /
 * فيه غلطة / قريب من صنف موجود) ← يدوس «سجّل» فيتسجّل كله مرة واحدة بالرصيد الافتتاحي.
 * مكتبة قراءة الإكسيل بتتحمّل بس لما يختار ملف (مش مع الصفحة). */
import { useRef, useState } from "react";

import {
  GOODS_TEMPLATE_URL,
  MAX_GOODS_ROWS,
  parseGoodsSheet,
  type GoodsSheetRow,
} from "@/lib/goods-import";
import { playSound } from "@/lib/sounds";
import type { NewGoodsItem } from "@/lib/supabase-queries";
import { cn } from "@/lib/utils";

export function GoodsSheetImport({
  existingNames,
  saving,
  onSave,
  onCancel,
}: {
  existingNames: string[];
  saving: boolean;
  onSave: (items: NewGoodsItem[]) => void;
  onCancel: () => void;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<GoodsSheetRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reading, setReading] = useState(false);

  async function readFile(file: File) {
    setError(null);
    setRows(null);
    setFileName(file.name);
    if (!/\.xlsx$/i.test(file.name)) {
      setError("الملف لازم يكون إكسيل .xlsx — افتحه في الإكسيل واحفظه «Excel Workbook»");
      playSound("error");
      return;
    }
    setReading(true);
    try {
      const { default: readXlsxFile } = await import("read-excel-file");
      const raw = await readXlsxFile(file, { sheet: 1 });
      const parsed = parseGoodsSheet(raw as unknown[][], existingNames);
      if (parsed.error) throw new Error(parsed.error);
      if (parsed.rows.length === 0) throw new Error("مفيش ولا صنف في الشيت");
      if (parsed.rows.length > MAX_GOODS_ROWS) {
        throw new Error(
          `الشيت فيه ${parsed.rows.length} سطر — أقصى حاجة ${MAX_GOODS_ROWS}، قسّمه على أكتر من شيت`,
        );
      }
      setRows(parsed.rows);
      playSound(parsed.rows.some((r) => r.error) ? "error" : "success");
    } catch (e) {
      setError(e instanceof Error ? e.message : "تعذّر قراية الملف");
      playSound("error");
    } finally {
      setReading(false);
    }
  }

  const ready = rows?.filter((r) => r.item && !r.error) ?? [];
  const bad = rows?.filter((r) => r.error) ?? [];
  const warned = ready.filter((r) => r.warning);

  return (
    <div className="mt-4 space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">رفع البضاعة من شيت إكسيل</h2>
        <a
          href={GOODS_TEMPLATE_URL}
          download="شيت-الأصناف.xlsx"
          className="rounded-md border border-primary/60 px-3 py-1.5 text-xs font-bold text-foreground hover:bg-primary/10"
        >
          ⬇️ نزّل الشيت الفاضي
        </a>
      </div>
      <ol className="list-inside list-decimal space-y-1 text-xs text-muted-foreground">
        <li>نزّل الشيت الفاضي، واكتب كل صنف في سطر (امسح الأمثلة).</li>
        <li>لازم: اسم الصنف وسعر البيع. الباقي لو موجود.</li>
        <li>ارفعه هنا، راجع، ودوس «سجّل».</li>
      </ol>

      <input
        ref={fileRef}
        type="file"
        accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void readFile(f);
          e.target.value = "";
        }}
      />
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={reading || saving}
        className="w-full rounded-xl border-2 border-dashed border-primary/60 p-5 text-center text-sm font-bold text-foreground hover:bg-primary/5 disabled:opacity-50"
      >
        {reading
          ? "جارٍ قراية الشيت..."
          : fileName
            ? `📄 ${fileName} — اختار ملف تاني`
            : "📄 اختار ملف الإكسيل"}
      </button>

      {error && <p className="text-sm font-bold text-destructive">{error}</p>}

      {rows && (
        <>
          <div className="flex flex-wrap gap-2 text-xs font-bold">
            <span className="rounded-full bg-success/15 px-3 py-1 text-success">
              {ready.length} صنف جاهز
            </span>
            {bad.length > 0 && (
              <span className="rounded-full bg-destructive/15 px-3 py-1 text-destructive">
                {bad.length} سطر فيه غلطة (مش هيتسجّل)
              </span>
            )}
            {warned.length > 0 && (
              <span className="rounded-full bg-warning/15 px-3 py-1 text-warning">
                {warned.length} قريب من صنف موجود — اتأكد إنه مش متكرر
              </span>
            )}
          </div>
          <div className="max-h-80 overflow-auto rounded-lg border border-border">
            <table className="keep-table w-full text-right text-xs">
              <thead className="sticky top-0 bg-card text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-2 py-2 font-medium">سطر</th>
                  <th className="px-2 py-2 font-medium">الصنف</th>
                  <th className="px-2 py-2 font-medium">الوحدة</th>
                  <th className="px-2 py-2 font-medium">الكمية</th>
                  <th className="px-2 py-2 font-medium">سعر البيع</th>
                  <th className="px-2 py-2 font-medium">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.line}
                    className={cn(
                      "border-b border-border last:border-0",
                      r.error && "bg-destructive/5",
                      !r.error && r.warning && "bg-warning/5",
                    )}
                  >
                    <td className="px-2 py-1.5 text-muted-foreground">{r.line}</td>
                    <td className="px-2 py-1.5 font-medium text-foreground">{r.name || "—"}</td>
                    <td className="px-2 py-1.5">{r.unit}</td>
                    <td className="px-2 py-1.5" dir="ltr">
                      {r.qty}
                    </td>
                    <td className="px-2 py-1.5" dir="ltr">
                      {r.cash}
                    </td>
                    <td
                      className={cn(
                        "px-2 py-1.5 font-bold",
                        r.error ? "text-destructive" : r.warning ? "text-warning" : "text-success",
                      )}
                    >
                      {r.error ?? r.warning ?? "تمام"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={saving || ready.length === 0}
          onClick={() => {
            if (
              bad.length > 0 &&
              !window.confirm(
                `فيه ${bad.length} سطر فيه غلطة ومش هيتسجّل. تسجّل الـ${ready.length} الباقيين؟`,
              )
            ) {
              return;
            }
            onSave(ready.map((r) => r.item as NewGoodsItem));
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {saving ? "جارٍ التسجيل..." : `سجّل ${ready.length} صنف`}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-input px-4 py-2 text-sm font-medium text-foreground hover:bg-accent"
        >
          إلغاء
        </button>
      </div>
    </div>
  );
}
