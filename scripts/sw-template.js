/* عامل الخدمة بتاع حسبة (بند 79). بيتولّد وقت البناء من الملف ده (scripts/build-sw.ts) — متعدّلش
 * الملف المتولّد. وظيفته:
 *   • يحفظ ملفات البرنامج (assets) على الجهاز، فالبرنامج يفتح من غير نت.
 *   • يحفظ كل صفحة اتفتحت، ولو النت فاصل يرجّعها من الحفظ.
 *   • لما نسخة جديدة تنزل: يستنى لحد ما المستخدم يدوس "تحديث" (مفيش إعادة تحميل غصب عنه).
 *   • طلبات البيانات (Supabase) مش بتعدّي عليه خالص — دي ليها نسختها على الجهاز (table-sync.ts). */
const VERSION = "__VERSION__";
const ASSETS = __ASSETS__;
const PAGES = __PAGES__;
const ASSET_CACHE = `hesba-assets-${VERSION}`;
const PAGE_CACHE = "hesba-pages";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const assets = await caches.open(ASSET_CACHE);
      await assets.addAll(ASSETS);
      const pages = await caches.open(PAGE_CACHE);
      await Promise.all(
        PAGES.map((path) =>
          fetch(path, { credentials: "same-origin" })
            .then((res) => (res.ok ? pages.put(path, res) : undefined))
            .catch(() => undefined),
        ),
      );
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key.startsWith("hesba-assets-") && key !== ASSET_CACHE) await caches.delete(key);
      }
      // الصفحات المحفوظة من النسخة القديمة بتشاور على ملفات اتشالت — نبدأ من جديد.
      await caches.delete(PAGE_CACHE);
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (url.pathname.startsWith("/assets/") || url.pathname.startsWith("/icons/")) {
    event.respondWith(
      caches.match(req).then(
        (hit) =>
          hit ||
          fetch(req).then((res) => {
            if (res.ok) caches.open(ASSET_CACHE).then((c) => c.put(req, res.clone()));
            return res;
          }),
      ),
    );
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const pages = await caches.open(PAGE_CACHE);
        try {
          const res = await fetch(req);
          if (res.ok) pages.put(url.pathname, res.clone());
          return res;
        } catch {
          // من غير نت: نفس الصفحة لو اتفتحت قبل كده، وإلا أقرب صفحة محفوظة (البرنامج بيعرض الصفحة
          // الصح لوحده من العنوان بعد ما يحمّل).
          const same = await pages.match(url.pathname);
          if (same) return same;
          const fallback =
            (await pages.match("/dashboard")) ||
            (await pages.match("/customers")) ||
            (await pages.match("/"));
          if (fallback) return fallback;
          return new Response(
            '<!doctype html><html lang="ar" dir="rtl"><meta charset="utf-8"><body style="font-family:sans-serif;padding:2rem;text-align:center"><h2>مفيش نت</h2><p>افتح البرنامج مرة واحدة والنت شغال، وبعدها هيفتح من غير نت.</p></body></html>',
            { headers: { "content-type": "text/html; charset=utf-8" } },
          );
        }
      })(),
    );
  }
});
