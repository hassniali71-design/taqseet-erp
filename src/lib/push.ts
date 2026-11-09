/**
 * إشعارات الستارة على التليفون — ناحية التليفون. نفس الملف في دكانة وسفرة.
 *
 *  1. الشغّال يدوس «فعّل» → التليفون يسأله «تسمح بالإشعارات؟».
 *  2. التليفون يعمل «اشتراك» عند جوجل/أبل (بمفتاحنا العام) → بنسجّله في القاعدة (push_subscribe).
 *  3. أي حدث في القاعدة (بيع، أوردر…) → القاعدة تختار التليفونات → موقعنا يبعت (src/lib/push-dispatch.ts).
 *
 * الآيفون: الإشعارات بتشتغل بس لو البرنامج متسطّب على الشاشة الرئيسية (iOS 16.4+).
 *
 * حسبة (بند 84): عميل Supabase من `@/lib/supabase-client`، والمفتاح العام من `VITE_PUSH_PUBLIC_KEY`
 * (بيتكتب في .env بسكريبت `scripts/setup-push-keys.ts` على جهاز المالك — مش في الريبو).
 */
import { supabase } from "@/lib/supabase-client";

/** المفتاح العام (مش سر — بيروح لكل تليفون). الخاص على السيرفر بس (_keys\push-vapid-taqseet.env).
 * لو لسه متحطّش، الإشعارات بتقول "لسه بتتجهّز" ومفيش حاجة بتبوظ. */
export const PUSH_PUBLIC_KEY = String(import.meta.env["VITE_PUSH_PUBLIC_KEY"] ?? "").trim();

export type PushState =
  | "on" // الإذن موجود والتليفون متسجّل
  | "off" // لسه ماتفعّلش (أو اتقفل من البرنامج)
  | "denied" // الشغّال رفض من التليفون — لازم يفتحها من إعدادات المتصفح
  | "ios-install" // آيفون مش متسطّب: لازم «إضافة للشاشة الرئيسية» الأول
  | "unsupported" // المتصفح ده مايدعمش
  | "not-ready"; // الإشعارات لسه متجهزتش على البرنامج (المفتاح العام مش متحط)

const SYNC_KEY = "push_synced_at";
const SYNC_EVERY_MS = 12 * 3600 * 1000;

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    (navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

function supported(): boolean {
  return (
    typeof window !== "undefined" &&
    "serviceWorker" in navigator &&
    "PushManager" in window &&
    "Notification" in window
  );
}

function keyBytes(b64url: string): Uint8Array {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((b64url.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!supported()) return null;
  // عامل الخلفية بيتسجّل في النسخة المنشورة بس (src/lib/pwa.ts)
  const reg = await navigator.serviceWorker.getRegistration();
  if (!reg) return null;
  return navigator.serviceWorker.ready;
}

export async function getPushState(): Promise<PushState> {
  if (!PUSH_PUBLIC_KEY) return "not-ready";
  if (isIos() && !isStandalone()) return "ios-install";
  if (!supported()) return "unsupported";
  if (Notification.permission === "denied") return "denied";
  if (Notification.permission !== "granted") return "off";
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  return sub ? "on" : "off";
}

async function saveSubscription(sub: PushSubscription): Promise<void> {
  const j = sub.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) throw new Error("الاشتراك ناقص");
  const { error } = await supabase.rpc("push_subscribe", {
    _endpoint: j.endpoint,
    _p256dh: j.keys.p256dh,
    _auth: j.keys.auth,
    _device: (navigator.userAgent || "").slice(0, 200),
  });
  if (error) throw error;
  try {
    localStorage.setItem(SYNC_KEY, String(Date.now()));
  } catch {
    /* مش مهم */
  }
}

/** «فعّل الإشعارات»: لازم تتنده من ضغطة زرار (التليفون مش بيسأل غير بعد لمسة). */
export async function enablePush(): Promise<PushState> {
  const state = await getPushState();
  if (
    state === "ios-install" ||
    state === "unsupported" ||
    state === "denied" ||
    state === "not-ready"
  )
    return state;
  const permission = await Notification.requestPermission();
  if (permission !== "granted") return permission === "denied" ? "denied" : "off";
  const reg = await registration();
  if (!reg) throw new Error("البرنامج لسه بيتسطّب على الجهاز — جرّب كمان ثواني");
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) as BufferSource,
    }));
  await saveSubscription(sub);
  return "on";
}

/** يقفل الإشعارات على الجهاز ده بس. */
export async function disablePush(): Promise<void> {
  const reg = await registration();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await supabase.rpc("push_unsubscribe", { _endpoint: sub.endpoint });
  await sub.unsubscribe().catch(() => undefined);
}

/**
 * مع كل فتحة للبرنامج: لو الإذن موجود، نتأكد إن التليفون متسجّل باسم اللي داخل دلوقتي
 * (اتغيّر المستخدم على نفس التليفون، أو جوجل غيّرت العنوان). مرة كل 12 ساعة بالكتير.
 */
export async function syncPush(force = false): Promise<void> {
  try {
    if (!PUSH_PUBLIC_KEY || !supported() || Notification.permission !== "granted") return;
    if (!force) {
      const last = Number(localStorage.getItem(SYNC_KEY) || 0);
      if (Date.now() - last < SYNC_EVERY_MS) return;
    }
    const reg = await registration();
    if (!reg) return;
    const sub =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: keyBytes(PUSH_PUBLIC_KEY) as BufferSource,
      }));
    await saveSubscription(sub);
  } catch {
    /* المرة الجاية */
  }
}

/** قبل «خروج»: التليفون ده مايوصلوش إشعارات الحساب ده تاني. */
export async function forgetPushOnSignOut(): Promise<void> {
  try {
    const reg = await registration();
    const sub = await reg?.pushManager.getSubscription();
    if (sub) await supabase.rpc("push_unsubscribe", { _endpoint: sub.endpoint });
    localStorage.removeItem(SYNC_KEY);
  } catch {
    /* مش هيوقف الخروج */
  }
}

/** «ابعتلي إشعار تجربة» — القاعدة تبعت لكل تليفونات المستخدم ده. */
export async function sendTestPush(): Promise<number> {
  const { data, error } = await supabase.rpc("push_test");
  if (error) throw error;
  return Number(data) || 0;
}
