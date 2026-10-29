import { useEffect, useState } from "react";

/** التسطيب على الجهاز + رسالة التحديث (بند 79).
 *
 * • `beforeinstallprompt` بيتمسك **أول ما الملف ده يتحمّل** (مستورد من __root)، مش جوه مكوّن —
 *   في سفرة ودكانة زرار التسطيب ماكانش بيظهر لأن الحدث كان بيعدّي قبل ما المكوّن يتركّب.
 * • عامل الخدمة بيتسجّل في النسخة المنشورة بس (مش وقت التطوير).
 * • لما نسخة جديدة تنزل، مش بنعمل إعادة تحميل غصب عن المستخدم (ممكن يكون في نص تحصيل) — بنظهر
 *   رسالة "فيه تحديث" وهو اللي يدوس. */

type InstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<unknown> };

let installEvent: InstallPromptEvent | null = null;
let waitingWorker: ServiceWorker | null = null;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    installEvent = e as InstallPromptEvent;
    notify();
  });
  window.addEventListener("appinstalled", () => {
    installEvent = null;
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

const readInstall = () => installEvent !== null;
const readUpdate = () => waitingWorker !== null;

/** زرار "تسطيب البرنامج" بيظهر بس لما المتصفح يسمح بالتسطيب. */
export function useCanInstall() {
  return useStore(readInstall);
}

export async function installApp() {
  if (!installEvent) return;
  await installEvent.prompt();
  installEvent = null;
  notify();
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
