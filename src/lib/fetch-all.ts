/** جلب كل الصفوف من Supabase على صفحات (بند 71 + 78).
 *
 * Supabase/PostgREST بيرجّع أقصى عدد صفوف في الطلب الواحد = إعداد "Max Rows" في المشروع (1000
 * افتراضيًا)، ولو فيه أكتر بيقطع الباقي **من غير أي خطأ**. الملف ده هو المكان الوحيد اللي بيتعامل
 * مع الحد ده، ومستقل عنه تمامًا: الكود بيطلب `PAGE_SIZE` صف في كل صفحة، والسيرفر بيرجّع
 * min(PAGE_SIZE, Max Rows)، وبنكمّل لحد ما البيانات تخلص فعلًا — فالنتيجة صح سواء Max Rows
 * كان 5 أو 1000 أو 10000. رفع Max Rows لـ10000 بيقلل عدد الطلبات بس (أسرع)، مش شرط للصحة.
 *
 * الترتيب دايمًا بينتهي بـ`id` (فريد) عشان الصفحات متتداخلش. ولو صف اتضاف أثناء الجلب وزحزح
 * الصفحات، التكرار بيتشال بالـid في الآخر؛ والتحديث اللحظي (useRealtimeSync) بيعيد الجلب بعدها. */

/** أكبر صفحة بنطلبها. السيرفر بيقصّها لـMax Rows لو أصغر. */
export const PAGE_SIZE = 10000;

/** حد أمان ضد لوب لا نهائي فقط — 10,000 صفحة × (حتى أصغر Max Rows معقول) أكبر بكتير من أي محل. */
const MAX_PAGES = 10000;

type PageResult<R> = { data: R[] | null; error: { message: string } | null; count?: number | null };

export type PagedQuery<R> = {
  order(column: string, options?: { ascending?: boolean }): PagedQuery<R>;
  range(from: number, to: number): PromiseLike<PageResult<R>>;
};

function dedupeById<R>(rows: R[]): R[] {
  const seen = new Set<unknown>();
  const out: R[] = [];
  for (const row of rows) {
    const id = (row as { id?: unknown }).id;
    if (id === undefined) {
      out.push(row);
      continue;
    }
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(row);
  }
  return out;
}

/** بياخد استعلام Supabase من غير تنفيذ (أي select + فلاتر)، يرتّبه بـ`id` ويجيبه صفحة صفحة لحد
 * صفحة فاضية. نفس شكل `{ data, error }` بتاع Supabase عشان أماكن الاستدعاء متتغيرش.
 * لو الاستعلام اتطلب بـ`{ count: "exact" }` بيستخدم العدد عشان يوفّر الطلب الأخير الفاضي. */
export async function fetchAll<R>(
  query: PagedQuery<R>,
): Promise<{ data: R[]; error: { message: string } | null }> {
  const rows: R[] = [];
  let total: number | null = null;
  const ordered = query.order("id", { ascending: true });
  for (let page = 0; page < MAX_PAGES; page++) {
    const { data, error, count } = await ordered.range(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) return { data: dedupeById(rows), error };
    if (page === 0 && typeof count === "number") total = count;
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length === 0) break;
    if (total !== null && rows.length >= total) break;
  }
  return { data: dedupeById(rows), error: null };
}
