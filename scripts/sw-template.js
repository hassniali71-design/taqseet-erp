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

// ---- إشعارات الستارة (Web Push) — بند 84، منقول زي ما هو من دكانة/سفرة. Phone notifications (Web Push): the server sends {title, body, url, tag}
// (src/lib/push-dispatch.ts). Shown in the phone's notification shade even when the
// app is closed; a tap opens the app straight on that page.
self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = { title: event.data ? event.data.text() : "" };
  }
  const title = data.title || "إشعار جديد";
  event.waitUntil(
    (async () => {
      // the app is open on screen: it rings itself too (src/components/push-notifications.tsx).
      // The shade's own sound is the phone's: an iPhone plays its system sound only when
      // Sounds is on for the installed app (Settings → Notifications → app) and Focus/silent is off;
      // the web gives no way to pick a sound or vibrate there (vibrate is Android only).
      try {
        const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
        for (const w of wins)
          if (w.visibilityState === "visible") w.postMessage({ type: "PUSH_RING", title });
      } catch {
        /* the shade notification below still shows */
      }
      await self.registration.showNotification(title, {
        body: data.body || "",
        icon: "/icons/icon-192.png",
        badge: "/notification-badge.png",
        dir: "rtl",
        lang: "ar",
        tag: data.tag || undefined,
        // a newer one with the same tag rings again instead of replacing silently
        renotify: !!data.tag,
        vibrate: [200, 100, 200],
        timestamp: data.ts || Date.now(),
        data: { url: data.url || "/" },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    (event.notification.data && event.notification.data.url) || "/",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    (async () => {
      const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      // the app is already open: bring it forward on that page
      for (const w of wins) {
        if (new URL(w.url).origin === self.location.origin) {
          await w.focus();
          if ("navigate" in w) {
            try {
              await w.navigate(target.href);
            } catch {
              w.postMessage({ type: "OPEN_URL", url: target.pathname + target.search });
            }
          }
          return;
        }
      }
      await self.clients.openWindow(target.href);
    })(),
  );
});
