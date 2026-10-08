import { useEffect, useState } from "react";

import { cn } from "@/lib/utils";

/**
 * بديل `<input type="date">` في كل النظام. السبب الحقيقي لمشكلة التابلت: الحقل الأصلي على
 * Chrome الكمبيوتر بيسمح بالكتابة مباشرة (يوم/شهر/سنة بالكيبورد)، لكن على Android بيفتح نافذة
 * تقويم النظام اللي بتتحرك شهر بشهر، واختيار السنة مستخبي ورا الضغط على رأس النافذة — فالمستخدم
 * بيلف سنة بسنة/شهر بشهر عشان يوصل لتاريخ قديم. مش باگ في الكود ولا في التنسيق؛ ده سلوك متصفح.
 *
 * الحل هنا مستقل عن المتصفح تمامًا وبيشتغل بنفس الشكل على PC وAndroid:
 * 1) كتابة يدوية بصيغة يوم/شهر/سنة بكيبورد أرقام (inputMode="numeric")، والشَرط بتتحط لوحدها.
 * 2) زرار 📅 بيفتح 3 قوايم (يوم / شهر / سنة) — أي سنة بضغطة واحدة.
 *
 * العقد مع الصفحات زي الحقل الأصلي بالظبط: `value`/`onChange` بصيغة `YYYY-MM-DD` أو "" — فمفيش
 * أي تغيير في `dateInputToTimestamp` ولا في طريقة الحفظ في قاعدة البيانات.
 */
const MONTHS = [
  "يناير",
  "فبراير",
  "مارس",
  "أبريل",
  "مايو",
  "يونيو",
  "يوليو",
  "أغسطس",
  "سبتمبر",
  "أكتوبر",
  "نوفمبر",
  "ديسمبر",
];

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** "YYYY-MM-DD" → "DD/MM/YYYY" للعرض. */
function isoToDisplay(iso: string) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : "";
}

/** "DD/MM/YYYY" → "YYYY-MM-DD" لو تاريخ حقيقي (مش 31/02 مثلًا)، غير كده null. */
function parseDisplayDate(text: string): string | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text.trim());
  if (!m) return null;
  const day = Number(m[1]);
  const month = Number(m[2]);
  const year = Number(m[3]);
  if (year < 1900 || year > 2100 || month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${pad(month)}-${pad(day)}`;
}

/** بيحط الشَرط تلقائيًا أثناء الكتابة: "15082024" → "15/08/2024". */
function autoFormat(raw: string) {
  if (raw.includes("/")) return raw.replace(/[^\d/]/g, "").slice(0, 10);
  const digits = raw.replace(/\D/g, "").slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

export function DateInput({
  value,
  onChange,
  className,
  required,
  title,
  placeholder = "يوم/شهر/سنة",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
  required?: boolean;
  title?: string;
  placeholder?: string;
}) {
  const [text, setText] = useState(() => isoToDisplay(value));
  const [open, setOpen] = useState(false);

  // مزامنة لما الصفحة نفسها تغيّر/تفضّي القيمة (مثلًا بعد الحفظ) — من غير ما نمسح كتابة جزئية.
  useEffect(() => {
    if (value !== (parseDisplayDate(text) ?? "")) setText(isoToDisplay(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const invalid = text.trim() !== "" && parseDisplayDate(text) === null;

  function handleText(raw: string) {
    const next = autoFormat(raw);
    setText(next);
    const parsed = parseDisplayDate(next);
    onChange(parsed ?? "");
  }

  const today = new Date();
  const [selY, selM, selD] = value
    ? value.split("-").map(Number)
    : [today.getFullYear(), today.getMonth() + 1, today.getDate()];
  const currentYear = today.getFullYear();
  const years: number[] = [];
  for (let y = currentYear + 10; y >= currentYear - 40; y--) years.push(y);
  if (!years.includes(selY as number)) years.push(selY as number);

  function pick(year: number, month: number, day: number) {
    const safeDay = Math.min(day, daysInMonth(year, month));
    const iso = `${year}-${pad(month)}-${pad(safeDay)}`;
    setText(isoToDisplay(iso));
    onChange(iso);
  }

  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex gap-1">
        <input
          type="text"
          inputMode="numeric"
          autoComplete="off"
          dir="ltr"
          value={text}
          required={required}
          title={title}
          placeholder={placeholder}
          onChange={(e) => handleText(e.target.value)}
          className={cn("form-input min-w-0 flex-1", invalid && "border-destructive")}
        />
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="اختيار التاريخ من قايمة"
          className="shrink-0 rounded-md border border-input px-2 text-sm hover:bg-accent"
        >
          📅
        </button>
      </div>
      {open && (
        <div className="flex flex-wrap gap-1" dir="rtl">
          <select
            aria-label="اليوم"
            value={selD}
            onChange={(e) => pick(selY as number, selM as number, Number(e.target.value))}
            className="form-input w-auto"
          >
            {Array.from(
              { length: daysInMonth(selY as number, selM as number) },
              (_, i) => i + 1,
            ).map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
          <select
            aria-label="الشهر"
            value={selM}
            onChange={(e) => pick(selY as number, Number(e.target.value), selD as number)}
            className="form-input w-auto"
          >
            {MONTHS.map((name, i) => (
              <option key={name} value={i + 1}>
                {name}
              </option>
            ))}
          </select>
          <select
            aria-label="السنة"
            value={selY}
            onChange={(e) => pick(Number(e.target.value), selM as number, selD as number)}
            className="form-input w-auto"
          >
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="rounded-md border border-input px-2 text-xs hover:bg-accent"
          >
            تم
          </button>
        </div>
      )}
      {invalid && (
        <p className="text-[11px] text-destructive">تاريخ غير صحيح — اكتبه يوم/شهر/سنة</p>
      )}
    </div>
  );
}
