import { useEffect, useState } from "react";

/** التسطيب على الجهاز + رسالة التحديث (بند 79).
 *
 * • `beforeinstallprompt` بيتمسك **أول ما الملف ده يتحمّل** (مستورد من __root)، مش جوه مكوّن —
 *   في سفرة ودكانة زرار التسطيب ماكانش بيظهر لأن الحدث كان بيعدّي قبل ما المكوّن يتركّب.
 * • عامل الخدمة بيتسجّل في النسخة المنشورة بس (مش وقت التطوير).
 * • لما نسخة جديدة تنزل، مش بنعمل إعادة تحميل غصب عن المستخدم (ممكن يكون في نص تحصيل) — بنظهر
 *   رسالة "فيه تحديث" وهو اللي يدوس. */

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

/** علامة "البرنامج اتسطّب على الجهاز ده" (بند 81 — منقولة من دكانة/سفرة). بتتسجّل مع حدث
 * `appinstalled`، وبتتشال لو المتصفح رجع عرض التسطيب (يعني البرنامج اتمسح من الجهاز). */
const INSTALLED_KEY = "app-installed";
function setInstalledFlag(on: boolean) {
  try {
    if (on) window.localStorage.setItem(INSTALLED_KEY, String(Date.now()));
    else window.localStorage.removeItem(INSTALLED_KEY);
  } catch {
    /* التخزين مقفول: خطوات التسطيب بتظهر برضه */
  }
}
function installedHere() {
  try {
    return Boolean(window.localStorage.getItem(INSTALLED_KEY));
  } catch {
    return false;
  }
}

let installEvent: InstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    // المتصفح بيعرض التسطيب بس لما البرنامج مش متسطّب هنا (أو اتمسح).
    setInstalledFlag(false);
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
    setInstalledFlag(true);
    notify();
  });
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          const track = (sw: ServiceWorker | null) => {
            if (!sw) return;
            sw.addEventListener("statechange", () => {
              // "installed" ومعاه عامل قديم شغال = نسخة جديدة مستنية موافقة المستخدم.
              if (sw.state === "installed" && navigator.serviceWorker.controller) {
                waitingWorker = sw;
                notify();
              }
            });
          };
          if (reg.waiting && navigator.serviceWorker.controller) {
            waitingWorker = reg.waiting;
            notify();
          }
          reg.addEventListener("updatefound", () => track(reg.installing));
          // نتشيّك على نسخة جديدة كل ساعة لو البرنامج فاضل مفتوح.
          setInterval(() => void reg.update().catch(() => undefined), 60 * 60_000);
        })
        .catch(() => undefined);
      let reloaded = false;
      navigator.serviceWorker.addEventListener("controllerchange", () => {
        if (reloaded) return;
        reloaded = true;
        window.location.reload();
      });
    });
  }
}

function useStore<T>(read: () => T): T {
  const [value, setValue] = useState(read);
  useEffect(() => {
    const l = () => setValue(read);
    listeners.add(l);
    l();
    return () => {
      listeners.delete(l);
    };
  }, [read]);
  return value;
}

/** البرنامج مفتوح كتطبيق متسطّب (شباكه لوحده / أيقونة الشاشة الرئيسية)، مش في تاب متصفح. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia?.("(display-mode: standalone)").matches ||
    window.matchMedia?.("(display-mode: window-controls-overlay)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/** زرار "تسطيب البرنامج" بيعمل إيه على الجهاز ده:
 *  - "standalone": إحنا جوه البرنامج المتسطّب نفسه — الزرار بيفضل ظاهر ويقول "متسطّب بالفعل"؛
 *  - "prompt":     شباك التسطيب بتاع المتصفح جاهز؛
 *  - "installed":  متسطّب على الجهاز ده واتفتح من المتصفح — نقول فين يلاقيه؛
 *  - "manual":     مفيش شباك تسطيب (آيفون، أو اتداس إلغاء، أو متصفح تاني) — نعرض الخطوات. */
export type InstallState = "standalone" | "prompt" | "installed" | "manual";

const readInstall = (): InstallState =>
  isStandalone()
    ? "standalone"
    : installEvent
      ? "prompt"
      : typeof window !== "undefined" && installedHere()
        ? "installed"
        : "manual";
const readUpdate = () => waitingWorker !== null;

export function useInstallState(): InstallState {
  return useStore(readInstall);
}

/** بيفتح شباك التسطيب بتاع المتصفح؛ true = اتسطّب. الإلغاء بيسيب الزرار، والضغطة الجاية بتعرض
 * الخطوات (المتصفح بيعرض الشباك مرة واحدة لكل تحميل صفحة). */
export async function installApp(): Promise<boolean> {
  const evt = installEvent;
  if (!evt) return false;
  installEvent = null;
  try {
    await evt.prompt();
    const { outcome } = await evt.userChoice;
    if (outcome === "accepted") setInstalledFlag(true);
    return outcome === "accepted";
  } catch {
    return false;
  } finally {
    notify();
  }
}

export function useUpdateAvailable() {
  return useStore(readUpdate);
}

/** المستخدم داس "تحديث": النسخة الجديدة تشتغل والصفحة تتحمّل مرة واحدة. */
export function applyUpdate() {
  waitingWorker?.postMessage("SKIP_WAITING");
}

export function useOnline() {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    update();
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => {
      window.removeEventListener("online", update);
      window.removeEventListener("offline", update);
    };
  }, []);
  return online;
}
