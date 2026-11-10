/** بند 88 — بيعمل شيت الإكسيل الفاضي اللي محل الأدوات المنزلية بيملاه ويرفعه:
 * `public/templates/goods-template.xlsx` (بيتنزل من زرار «نزّل الشيت» في صفحة الأصناف).
 * التشغيل: bun run scripts/make-goods-template.ts
 * أسماء العواميد لازم تفضل زي `GOODS_SHEET_COLUMNS` في src/lib/goods-import.ts. */
import { mkdirSync } from "node:fs";
import writeXlsxFile from "write-excel-file/node";

import { GOODS_SHEET_COLUMNS } from "../src/lib/goods-import";

const header = GOODS_SHEET_COLUMNS.map((c) => ({
  value: c.title,
  fontWeight: "bold" as const,
  backgroundColor: c.required ? "#F4D35E" : "#E8EEF7",
  align: "center" as const,
  wrap: true,
  height: 36,
}));
const text = (value: string) => ({ type: String, value });
const num = (value: number) => ({ type: Number, value });
const empty = null;

// 3 أمثلة — المحل بيمسحهم ويكتب بضاعته.
const examples = [
  [
    text("طقم كوبايات زجاج"),
    text("زجاج"),
    text("طقم"),
    empty,
    num(120),
    num(160),
    num(10),
    num(2),
    empty,
  ],
  [
    text("طبق صيني كبير"),
    text("صيني"),
    text("دستة"),
    num(12),
    num(240),
    num(300),
    num(5),
    num(1),
    empty,
  ],
  [
    text("حلة ألومنيوم 30"),
    text("ألومنيوم"),
    text("قطعة"),
    empty,
    num(150),
    num(200),
    num(8),
    num(2),
    text("6221234567890"),
  ],
];

const help = [
  [{ value: "إزاي تملا الشيت", fontWeight: "bold" as const, fontSize: 14 }],
  [text("1. اكتب كل صنف في سطر في صفحة «الأصناف». امسح الأمثلة الأول.")],
  [text("2. العواميد الصفرا لازم تتكتب: اسم الصنف، وسعر البيع.")],
  [text("3. الوحدة: قطعة، أو دستة، أو طقم، أو كرتونة، أو علبة. لو سبتها فاضية = قطعة.")],
  [text("4. لو الوحدة دستة أو كرتونة: اكتب عدد القطع اللي جواها (الدستة 12 لو سبتها فاضية).")],
  [text("5. الأسعار والكمية بالوحدة اللي كتبتها: لو دستة، اكتب سعر الدستة وعدد الدست.")],
  [text("6. الباركود مش لازم.")],
  [text("7. احفظ الملف، وادخل صفحة الأصناف ← «ارفع شيت إكسيل»، وراجع وسجّل.")],
  [text("أقصى حاجة 500 صنف في الشيت الواحد.")],
];

mkdirSync("public/templates", { recursive: true });
await writeXlsxFile([[header, ...examples], help], {
  sheets: ["الأصناف", "طريقة الكتابة"],
  columns: [GOODS_SHEET_COLUMNS.map((c) => ({ width: c.width })), [{ width: 80 }]],
  filePath: "public/templates/goods-template.xlsx",
  rightToLeft: true,
  stickyRowsCount: 1,
  fontFamily: "Arial",
});
console.log("make-goods-template: public/templates/goods-template.xlsx");
