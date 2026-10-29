import type { QueryClient } from "@tanstack/react-query";

import { fetchAll, type PagedQuery } from "@/lib/fetch-all";
import { localGet, localKeys, localSet } from "@/lib/local-store";
import { supabase } from "@/lib/supabase-client";

/** مزامنة جدول واحد بين السيرفر ونسخة الجهاز (بند 79 — المرحلة 1 في TASK-0003).
 *
 * كل قايمة في البرنامج (useTenantList) بتمر من هنا:
 *   • **من غير نت:** بترجع نسخة الجهاز فورًا — البرنامج كله بيفتح ويعرض آخر بيانات اتجابت.
 *   • **بالنت، والجدول فيه عمود `updated_at` (ملف التحديث 0031):** بتجيب **اللي اتغيّر بس** من آخر
 *     مرة + أرقام الصفوف اللي اتمسحت (`sync_deleted_rows`)، وتدمجهم في النسخة وتحفظها.
 *   • **بالنت، والملف متطبّقش:** بتجيب الجدول كامل زي ما البرنامج كان بيعمل بالظبط (fetchAll).
 *   • **مرة كل يوم** (أو لو النسخة قديمة/ناقصة) بتجيب الجدول كامل تاني — أمان ضد أي تغيير فات.
 * الحسابات نفسها (المتبقي، الأقساط، الشركاء...) متتغيّرش: الصفحات بتستلم نفس الصفوف بنفس الشكل،
 * سواء جت من السيرفر كاملة أو من النسخة بعد الدمج. */

type Row = { id: string; updated_at?: string } & Record<string, unknown>;

type Snapshot<T> = {
  rows: T[];
  /** أكبر updated_at شُفناه — نقطة البداية للطلب الجاي. */
  cursor: string | null;
  /** أكبر deleted_at شُفناه في سجل المسح. */
  delCursor: string | null;
  fullAt: number;
  savedAt: number;
};

/** تداخل أمان: بنعيد طلب آخر 5 دقايق كل مرة، عشان صف اتعدّل في عملية لسه ما خلصتش وقت الطلب اللي
 * فات ميضيعش. الدمج بالـid، فالتكرار مالوش أي أثر. */
const OVERLAP_MS = 5 * 60_000;
/** لو آخر تغيير أقدم من كده بالنسبة لوقت آخر مزامنة، مفيش عملية ممكن تكون لسه شغالة من وقتها —
 * فمش محتاجين التداخل (وده بيمنع إعادة تنزيل كل الصفوف اللي ليها نفس الوقت القديم بعد تطبيق
 * الملف 0031). 6 ساعات عشان لو ساعة الجهاز غلط بساعة أو اتنين (التوقيت الصيفي) ميأثرش. */
const QUIET_MS = 6 * 60 * 60_000;

function sinceFor(cursor: string, savedAt: number) {
  return new Date(cursor).getTime() < savedAt - QUIET_MS ? cursor : minus(cursor, OVERLAP_MS);
}
/** جلب كامل للأمان مرة كل 24 ساعة على الأقل. */
const FULL_RESYNC_MS = 24 * 60 * 60_000;

/** null = لسه معرفناش، false = الملف 0031 متطبّقش (منحاولش تاني في الجلسة دي). */
let deltaSupported: boolean | null = null;

function snapshotKey(tenantId: string, table: string) {
  return `${tenantId}:${table}`;
}

function isOnline() {
  return typeof navigator === "undefined" || navigator.onLine !== false;
}

function maxTime(values: Array<string | null | undefined>): string | null {
  let best: string | null = null;
  let bestMs = -Infinity;
  for (const v of values) {
    if (!v) continue;
    const ms = new Date(v).getTime();
    if (ms > bestMs) {
      bestMs = ms;
      best = v;
    }
  }
  return best;
}

function minus(ts: string, ms: number) {
  return new Date(new Date(ts).getTime() - ms).toISOString();
}

/** نفس ترتيب السيرفر: العمود المطلوب، وبعده id (ترتيب ثابت). */
function sortRows<T extends Row>(rows: T[], opts?: { orderBy?: string; ascending?: boolean }) {
  const col = opts?.orderBy;
  const dir = opts?.ascending === false ? -1 : 1;
  return [...rows].sort((a, b) => {
    if (col) {
      const x = a[col] as string | number | null | undefined;
      const y = b[col] as string | number | null | undefined;
      if (x !== y) {
        if (x === null || x === undefined) return dir === 1 ? 1 : -1;
        if (y === null || y === undefined) return dir === 1 ? -1 : 1;
        return (x < y ? -1 : 1) * dir;
      }
    }
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

async function fullFetch<T extends Row>(
  table: string,
  tenantId: string,
  opts?: { orderBy?: string; ascending?: boolean },
): Promise<Snapshot<T>> {
  let query = supabase.from(table).select("*", { count: "exact" }).eq("tenant_id", tenantId);
  if (opts?.orderBy) query = query.order(opts.orderBy, { ascending: opts.ascending ?? true });
  const { data, error } = await fetchAll<T>(query as unknown as PagedQuery<T>);
  if (error) throw new Error(error.message);

  const cursor = maxTime(data.map((r) => r.updated_at));
  if (data.length > 0) deltaSupported = "updated_at" in (data[0] as object);

  // نقطة بداية سجل المسح: آخر صف اتمسح من الجدول ده لحد دلوقتي (أي حاجة اتمسحت بعده هتيجي في
  // الطلب الجاي). لو الجدول/الملف مش موجود بنسيبها فاضية.
  let delCursor: string | null = null;
  if (deltaSupported !== false) {
    const { data: lastDel } = await supabase
      .from("sync_deleted_rows")
      .select("deleted_at")
      .eq("tenant_id", tenantId)
      .eq("table_name", table)
      .order("deleted_at", { ascending: false })
      .limit(1);
    delCursor = (lastDel?.[0]?.deleted_at as string | undefined) ?? new Date(0).toISOString();
  }

  const now = Date.now();
  return { rows: data, cursor, delCursor, fullAt: now, savedAt: now };
}

/** بيرجّع null لو الطريقة دي مش متاحة (الملف 0031 متطبّقش) — ساعتها نجيب كامل. */
async function deltaFetch<T extends Row>(
  table: string,
  tenantId: string,
  snap: Snapshot<T>,
  opts?: { orderBy?: string; ascending?: boolean },
): Promise<Snapshot<T> | null> {
  if (!snap.cursor || !snap.delCursor) return null;
  const since = sinceFor(snap.cursor, snap.savedAt);
  const delSince = sinceFor(snap.delCursor, snap.savedAt);

  const [changed, deleted] = await Promise.all([
    fetchAll<T>(
      supabase
        .from(table)
        .select("*")
        .eq("tenant_id", tenantId)
        .gt("updated_at", since) as unknown as PagedQuery<T>,
    ),
    fetchAll<{ id: number; row_id: string; deleted_at: string }>(
      supabase
        .from("sync_deleted_rows")
        .select("id, row_id, deleted_at")
        .eq("tenant_id", tenantId)
        .eq("table_name", table)
        .gt("deleted_at", delSince) as unknown as PagedQuery<{
        id: number;
        row_id: string;
        deleted_at: string;
      }>,
    ),
  ]);
  for (const res of [changed, deleted]) {
    if (res.error) {
      const msg = res.error.message ?? "";
      // العمود أو جدول سجل المسح مش موجودين = الملف 0031 متطبّقش.
      if (
        msg.includes("updated_at") ||
        msg.includes("sync_deleted_rows") ||
        msg.includes("does not exist")
      ) {
        deltaSupported = false;
        return null;
      }
      throw new Error(msg);
    }
  }

  const byId = new Map(snap.rows.map((r) => [r.id, r]));
  for (const row of changed.data) byId.set(row.id, row);
  for (const d of deleted.data) byId.delete(d.row_id);

  return {
    rows: sortRows([...byId.values()], opts),
    cursor: maxTime([snap.cursor, ...changed.data.map((r) => r.updated_at)]),
    delCursor: maxTime([snap.delCursor, ...deleted.data.map((d) => d.deleted_at)]),
    fullAt: snap.fullAt,
    savedAt: Date.now(),
  };
}

export async function syncTable<T>(
  table: string,
  tenantId: string,
  opts?: { orderBy?: string; ascending?: boolean },
): Promise<T[]> {
  const key = snapshotKey(tenantId, table);
  const snap = await localGet<Snapshot<Row>>(key);

  if (!isOnline() && snap) return snap.rows as T[];

  try {
    let next: Snapshot<Row> | null = null;
    const fullDue = !snap || deltaSupported === false || Date.now() - snap.fullAt > FULL_RESYNC_MS;
    if (!fullDue && snap) next = await deltaFetch(table, tenantId, snap, opts);
    next ??= await fullFetch<Row>(table, tenantId, opts);
    void localSet(key, next);
    return next.rows as T[];
  } catch (e) {
    // النت فصل في نص الطلب: نعرض آخر نسخة بدل ما الصفحة تفضى.
    if (snap) return snap.rows as T[];
    throw e;
  }
}

/** أول ما البرنامج يفتح: نحط نسخة الجهاز في الذاكرة فورًا، فالصفحات تعرض على طول (حتى من غير
 * نت)، وبعدين المزامنة تشتغل في الخلفية. بنحط بس الجداول اللي لسه مش موجودة في الذاكرة. */
export async function hydrateFromLocal(queryClient: QueryClient, tenantId: string) {
  const keys = (await localKeys()).filter((k) => k.startsWith(`${tenantId}:`));
  await Promise.all(
    keys.map(async (k) => {
      const table = k.slice(tenantId.length + 1);
      const queryKey = [table, tenantId];
      if (queryClient.getQueryData(queryKey) !== undefined) return;
      const snap = await localGet<Snapshot<Row>>(k);
      if (snap) queryClient.setQueryData(queryKey, snap.rows, { updatedAt: snap.savedAt });
    }),
  );
}

/** آخر وقت اتحفظت فيه نسخة من أي جدول — للشريط اللي بيقول "آخر تحديث". */
export async function lastLocalSave(tenantId: string): Promise<number | null> {
  const keys = (await localKeys()).filter((k) => k.startsWith(`${tenantId}:`));
  let best: number | null = null;
  for (const k of keys) {
    const snap = await localGet<Snapshot<Row>>(k);
    if (snap && (best === null || snap.savedAt > best)) best = snap.savedAt;
  }
  return best;
}
