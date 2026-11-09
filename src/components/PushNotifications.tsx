/** إشعارات الستارة — الشاشات (src/lib/push.ts). بند 84، منقول من دكانة/سفرة
 * `push-notifications.tsx` (نفس السلوك والكلام؛ الشكل بعناصر عادية لأن المشروع ده مفيهوش
 * مكوّنات Button/Card الجاهزة).
 *  - PushBanner: شريط فوق الصفحة لكل الناس لحد ما يفعّلوا. بيربط كمان ضغطة الإشعار بالصفحة لو
 *    البرنامج كان مفتوح، وبيرن لو إشعار وصل والبرنامج قدامك، وبيسجّل التليفون مع كل فتحة.
 *  - PushSettingsCard: كارت في الإعدادات (الحالة، وتفعيل/قفل، وإشعار تجربة، ونصايح الأجهزة). */
import { useNavigate } from "@tanstack/react-router";
import { BellOff, BellRing, Send, X } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";

import {
  disablePush,
  enablePush,
  getPushState,
  sendTestPush,
  syncPush,
  type PushState,
} from "@/lib/push";
import { playSound } from "@/lib/sounds";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "push_banner_dismissed_at";
const DISMISS_FOR_MS = 3 * 24 * 3600 * 1000;

function usePushState() {
  const [state, setState] = useState<PushState | null>(null);
  const refresh = useCallback(() => {
    void getPushState()
      .then(setState)
      .catch(() => setState("unsupported"));
  }, []);
  useEffect(() => {
    refresh();
    const onVis = () => document.visibilityState === "visible" && refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [refresh]);
  return { state, setState, refresh };
}

const STATE_TEXT: Record<PushState, string> = {
  on: "الإشعارات شغالة على الجهاز ده ✅",
  off: "الإشعارات مقفولة على الجهاز ده",
  denied: "التليفون رافض الإشعارات للبرنامج ده",
  "ios-install": "على الآيفون لازم تسطّب البرنامج الأول",
  unsupported: "المتصفح ده مايدعمش الإشعارات",
  "not-ready": "الإشعارات لسه بتتجهّز على البرنامج — قريب",
};

function errorText(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

async function doEnable(setState: (s: PushState) => void) {
  try {
    const s = await enablePush();
    setState(s);
    if (s === "on") {
      playSound("done");
      toast.success("الإشعارات اتفعّلت ✅", {
        action: { label: "ابعتلي تجربة", onClick: () => void doTest() },
      });
    } else if (s === "denied") {
      toast.error("التليفون رفض. افتح الإذن من إعدادات المتصفح (شوف الشرح في الإعدادات)");
    }
  } catch (e) {
    toast.error(errorText(e, "ماقدرناش نفعّل الإشعارات"));
  }
}

async function doTest() {
  try {
    const n = await sendTestPush();
    if (n > 0) toast.success(`اتبعت إشعار تجربة لـ ${n} جهاز — بص في الستارة`);
    else toast.warning("مفيش جهاز متسجّل باسمك لسه — دوس «فعّل» الأول");
  } catch (e) {
    toast.error(errorText(e, "ماقدرناش نبعت التجربة"));
  }
}

function Btn({
  children,
  onClick,
  disabled,
  outline,
  className,
}: {
  children: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  outline?: boolean;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium disabled:opacity-50",
        outline
          ? "border border-input text-foreground hover:bg-accent"
          : "bg-primary text-primary-foreground hover:bg-primary/90",
        className,
      )}
    >
      {children}
    </button>
  );
}

export function PushBanner() {
  const navigate = useNavigate();
  const { state, setState } = usePushState();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => {
    try {
      setDismissed(Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_FOR_MS);
    } catch {
      setDismissed(false);
    }
    // التليفون متسجّل باسم اللي داخل دلوقتي (مرة كل 12 ساعة)
    void syncPush();
    // ضغطة على إشعار والبرنامج مفتوح: عامل الخلفية بيقول «روح للصفحة دي»
    const onMsg = (e: MessageEvent) => {
      const data = e.data as { type?: string; url?: unknown } | null;
      // إشعار وصل والبرنامج مفتوح قدامك: البرنامج يرن بنفسه (صوت التليفون في الستارة مش مضمون)
      if (data?.type === "PUSH_RING") {
        playSound("ding");
        return;
      }
      if (data?.type === "OPEN_URL" && typeof data.url === "string" && data.url.startsWith("/"))
        void navigate({ to: data.url });
    };
    navigator.serviceWorker?.addEventListener("message", onMsg);
    return () => navigator.serviceWorker?.removeEventListener("message", onMsg);
  }, [navigate]);

  if (dismissed || !state || state === "on" || state === "unsupported" || state === "not-ready")
    return null;

  const close = () => {
    setDismissed(true);
    try {
      localStorage.setItem(DISMISS_KEY, String(Date.now()));
    } catch {
      /* مش مهم */
    }
  };

  return (
    <div className="flex w-full max-w-xl items-center gap-2 rounded-lg border border-primary/40 bg-card px-3 py-2 text-sm shadow-lg">
      <BellRing className="h-4 w-4 shrink-0 text-foreground" />
      <span className="min-w-0 flex-1">
        {state === "ios-install"
          ? "عشان الإشعارات توصلك على الآيفون: دوس زرار المشاركة ⬆️ ← «إضافة إلى الشاشة الرئيسية»، وافتح البرنامج من الأيقونة."
          : state === "denied"
            ? "الإشعارات مقفولة للبرنامج ده. افتحها من إعدادات المتصفح ← الإشعارات ← اسمح."
            : "فعّل الإشعارات عشان كل تحصيل أو بيع يوصلك على تليفونك حتى والبرنامج مقفول."}
      </span>
      {state === "off" && (
        <Btn className="shrink-0" onClick={() => void doEnable(setState)}>
          فعّل
        </Btn>
      )}
      <button
        type="button"
        aria-label="اقفل"
        onClick={close}
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md hover:bg-black/5"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export function PushSettingsCard() {
  const { state, setState, refresh } = usePushState();
  const [busy, setBusy] = useState(false);
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    try {
      await f();
    } finally {
      setBusy(false);
      refresh();
    }
  };

  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold text-foreground">إشعارات الستارة على التليفون</h2>
      <div className="mt-3 space-y-4 text-sm">
        <p className="font-medium">{state ? STATE_TEXT[state] : "جاري التأكد..."}</p>
        <div className="flex flex-wrap gap-2">
          {state === "off" && (
            <Btn disabled={busy} onClick={() => void run(() => doEnable(setState))}>
              <BellRing className="h-4 w-4" /> فعّل على الجهاز ده
            </Btn>
          )}
          {state === "on" && (
            <>
              <Btn disabled={busy} onClick={() => void run(doTest)}>
                <Send className="h-4 w-4" /> ابعتلي إشعار تجربة
              </Btn>
              <Btn
                outline
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    await disablePush();
                    toast.success("الإشعارات اتقفلت على الجهاز ده");
                  })
                }
              >
                <BellOff className="h-4 w-4" /> اقفلها على الجهاز ده
              </Btn>
            </>
          )}
        </div>
        <div className="space-y-1 rounded-md bg-muted p-3 text-muted-foreground">
          <p className="font-medium text-foreground">
            الإشعار بيظهر من غير صوت؟ (أوبو / ريلمي / شاومي)
          </p>
          <p>
            إعدادات التليفون ← الإشعارات ← Chrome ← اسم البرنامج («حسبة») ← فعّل <b>الصوت</b> و
            <b>الإشعار العائم / البانر</b> و<b>شاشة القفل</b>.
          </p>
        </div>
        <div className="space-y-1 rounded-md bg-muted p-3 text-muted-foreground">
          <p className="font-medium text-foreground">لو الإشعار بيتأخر أو مش بيوصل:</p>
          <p>
            • شاومي / ريدمي / بوكو: إعدادات ← التطبيقات ← Chrome ← توفير البطارية ← «بدون قيود»،
            وفعّل «التشغيل التلقائي».
          </p>
          <p>• أوبو / ريلمي / فيفو: إعدادات ← البطارية ← Chrome ← «السماح بالنشاط في الخلفية».</p>
          <p>
            • سامسونج: إعدادات ← البطارية ← حدود استخدام الخلفية ← شيل Chrome من «التطبيقات
            النائمة».
          </p>
          <p>• آيفون: لازم البرنامج يكون متسطّب على الشاشة الرئيسية (iOS 16.4 أو أحدث).</p>
          <p>• صوت الإشعار في الستارة هو صوت إشعارات التليفون نفسه.</p>
        </div>
        <div className="space-y-1 rounded-md border border-warning/40 bg-warning/10 p-3 text-muted-foreground">
          <p className="font-medium text-foreground">آيفون: الإشعار بيظهر بس من غير صوت؟</p>
          <p>
            الآيفون مابيسمحش لأي برنامج ويب يختار صوت أو يهز. بيشغّل صوت الإشعارات العادي بتاعه، بس
            لو مسموح له. اتأكد من 4 حاجات:
          </p>
          <p>
            1. الإعدادات ← الإشعارات ← دوّر على اسم البرنامج (الاسم اللي على الأيقونة) ← فعّل
            «السماح بالإشعارات» و«الأصوات».
          </p>
          <p>2. زرار الصامت اللي على جنب التليفون مش مقفول (مايبقاش باين لون أحمر/برتقالي).</p>
          <p>3. «التركيز» أو «عدم الإزعاج» مقفول (من مركز التحكم، أيقونة القمر).</p>
          <p>4. الإعدادات ← الأصوات والحس اللمسي: صوت التنبيهات مش على الآخر واطي.</p>
          <p>ولما البرنامج يكون مفتوح قدامك، هو بيرن بنفسه مع كل إشعار جديد.</p>
        </div>
      </div>
    </section>
  );
}
