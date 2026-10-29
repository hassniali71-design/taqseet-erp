/** مخزن صغير على الجهاز (IndexedDB) لنسخة بيانات المحل (بند 79).
 *
 * من غير مكتبات: قاعدة واحدة "hesba-local" فيها مخزن واحد بمفاتيح نصية. كل جدول بيتخزن تحت مفتاح
 * `<المحل>:<الجدول>` ومعاه وقت آخر مزامنة. كل الدوال هنا "ما بترميش أخطاء": لو المتصفح مش بيدعم
 * IndexedDB أو الذاكرة مليانة، بنرجع null ونكمّل من السيرفر عادي — النسخة المحلية تحسين، مش شرط. */

const DB_NAME = "hesba-local";
const STORE = "kv";
const VERSION = 1;

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  dbPromise ??= new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function run<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise((resolve) => {
        if (!db) return resolve(null);
        try {
          const req = fn(db.transaction(STORE, mode).objectStore(STORE));
          req.onsuccess = () => resolve(req.result ?? null);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function localGet<T>(key: string): Promise<T | null> {
  return run<T>("readonly", (s) => s.get(key) as IDBRequest<T>);
}

export function localSet(key: string, value: unknown): Promise<unknown> {
  return run("readwrite", (s) => s.put(value, key));
}

export function localKeys(): Promise<string[]> {
  return run<IDBValidKey[]>("readonly", (s) => s.getAllKeys()).then((keys) =>
    (keys ?? []).map(String),
  );
}

/** تسجيل الخروج: نسخة بيانات المحل بتتمسح من الجهاز بالكامل (قرار المالك) — ما عدا طابور
 * العمليات اللي لسه موصلتش السيرفر (`outbox:`)، دي عقود وتحصيلات حقيقية ومينفعش تضيع؛ بتتبعت أول
 * ما حد من نفس المحل يدخل تاني (بند 80). */
export async function localClearAll(): Promise<unknown> {
  const keys = await localKeys();
  await Promise.all(
    keys.filter((k) => !k.startsWith("outbox:")).map((k) => run("readwrite", (s) => s.delete(k))),
  );
  return null;
}
