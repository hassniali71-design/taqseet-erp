/** التليفون (بند 81 — منقول من دكانة/سفرة): أي جدول جوه الصفحة بيتعرض كروت — كارت لكل صف — من غير
 * ما نلمس أي صفحة. الشكل في styles.css (max-width: 767px)؛ هنا بس بنكتب على كل خانة اسم عمودها
 * (`data-label`، بيظهر فوق القيمة) وبنعلّم خانة العنوان وخانة الزراير. جدول لازم يفضل جدول بياخد
 * `keep-table`. الكمبيوتر مبيتلمسش: الأسماء بتتكتب بس والشاشة بحجم تليفون. */
const PHONE = "(max-width: 767px)";

function labelTable(table: HTMLTableElement) {
  const head = table.tHead?.rows[table.tHead.rows.length - 1];
  if (!head) return;
  const labels: string[] = [];
  for (const th of Array.from(head.cells)) {
    const text = (th.textContent ?? "").replace(/\s+/g, " ").trim();
    for (let i = 0; i < Math.max(1, th.colSpan); i++) labels.push(text);
  }
  // عنوان الكارت: أول عمود ليه اسم ومش عدّاد صفوف («#»، «م»)
  const primary = labels.findIndex((l) => l !== "" && !/^(#|م|ت|مسلسل)$/.test(l));
  const last = labels.length - 1;
  const rows = [
    ...Array.from(table.tBodies).flatMap((b) => Array.from(b.rows)),
    ...Array.from(table.tFoot?.rows ?? []),
  ];
  for (const tr of rows) {
    let col = 0;
    for (const td of Array.from(tr.cells)) {
      const label = td.colSpan > 1 ? "" : (labels[col] ?? "");
      if (td.getAttribute("data-label") !== label) td.setAttribute("data-label", label);
      const role =
        td.colSpan > 1 && tr.cells.length === 1
          ? "full"
          : col === primary
            ? "title"
            : /إجراء|إجراءات/.test(label) ||
                // خانة فيها خانات كتابة أو زراير (زي "تحصيل": المبلغ + التاريخ + الزرار) بتاخد عرض الكارت كله
                !!td.querySelector("button, input, select") ||
                (col === last && label === "" && !!td.querySelector("a"))
              ? "actions"
              : label === ""
                ? "bare"
                : "";
      if ((td.getAttribute("data-card") ?? "") !== role) {
        if (role) td.setAttribute("data-card", role);
        else td.removeAttribute("data-card");
      }
      col += Math.max(1, td.colSpan);
    }
  }
}

let started = false;
export function startTableCards() {
  if (started || typeof window === "undefined" || !window.matchMedia) return;
  started = true;
  const mq = window.matchMedia(PHONE);
  let queued = false;
  const run = () => {
    queued = false;
    if (!mq.matches) return;
    document.querySelectorAll<HTMLTableElement>("main table:not(.keep-table)").forEach(labelTable);
  };
  const schedule = () => {
    if (queued) return;
    queued = true;
    requestAnimationFrame(run);
  };
  // الصفوف بتتغيّر (بحث، تحديث لحظي): بنعيد الأسماء بعد كل تغيير. بنراقب الأبناء بس، فالخصائص
  // اللي بنكتبها هنا مبتشغّلش المراقبة تاني.
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  mq.addEventListener?.("change", schedule);
  schedule();
}
