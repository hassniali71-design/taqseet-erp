import { CheckCircle2, MonitorDown, X } from "lucide-react";
import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

import { installApp, useInstallState } from "@/lib/pwa";
import { cn } from "@/lib/utils";

/** زرار "تسطيب البرنامج" (بند 81 — منقول من دكانة/سفرة `install-app-button.tsx`).
 *
 * بيفضل موجود **دايمًا** — حتى جوه البرنامج المتسطّب نفسه (طلب المالك، الفرق الوحيد عن دكانة):
 *  • مش متسطّب والمتصفح جاهز → شباك التسطيب بتاع المتصفح على طول.
 *  • مش متسطّب ومفيش شباك (آيفون، أو اتداس إلغاء، أو متصفح تاني) → خطوات التسطيب بالإيد حسب الجهاز.
 *  • متسطّب على الجهاز ده واتفتح من المتصفح → "متسطّب عندك ✅" وفين يلاقيه.
 *  • جوه البرنامج المتسطّب → "متسطّب بالفعل وإنت فاتحه منه دلوقتي ✅". */

const APP_NAME = "حسبة";
const APP_FULL_NAME = "حسبة — لإدارة محلات الأجهزة والتقسيط";

type Device = "iphone" | "android" | "desktop";
function device(): Device {
  const ua = typeof navigator === "undefined" ? "" : navigator.userAgent;
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1))
    return "iphone";
  if (/Android/i.test(ua)) return "android";
  return "desktop";
}

/** مكان البرنامج المتسطّب على كل نوع جهاز (مفيش متصفح بيقول الفولدر بالظبط). */
function WhereItIs({ d }: { d: Device }) {
  if (d === "desktop")
    return (
      <ul className="list-disc space-y-1.5 pe-5">
        <li>
          على <b>سطح المكتب</b>: دوّر على أيقونة «{APP_NAME}».
        </li>
        <li>
          أو افتح <b>قائمة ابدأ</b> (زرار ويندوز) واكتب «{APP_NAME}» ودوس عليه.
        </li>
        <li>عشان يبقى أسهل: كليك يمين على الأيقونة ← «تثبيت في شريط المهام».</li>
      </ul>
    );
  return (
    <ul className="list-disc space-y-1.5 pe-5">
      <li>
        على <b>الشاشة الرئيسية</b> للموبايل هتلاقي أيقونة «{APP_NAME}».
      </li>
      <li>
        مش لاقيها؟ اسحب الشاشة لتحت ودوّر في <b>البحث</b> عن «{APP_NAME}»
        {d === "android" ? " أو في قايمة كل التطبيقات" : ""}.
      </li>
    </ul>
  );
}

function HowToInstall({ d }: { d: Device }) {
  if (d === "iphone")
    return (
      <ol className="list-decimal space-y-1.5 pe-5">
        <li>
          افتح البرنامج من <b>Safari</b> (مش من أي متصفح تاني).
        </li>
        <li>
          دوس زرار <b>المشاركة</b> (المربع اللي طالع منه سهم) تحت الشاشة.
        </li>
        <li>
          اختار <b>«إضافة إلى الشاشة الرئيسية»</b> ← «إضافة».
        </li>
      </ol>
    );
  if (d === "android")
    return (
      <ol className="list-decimal space-y-1.5 pe-5">
        <li>
          افتح البرنامج من <b>Chrome</b>.
        </li>
        <li>
          دوس <b>النقط التلاتة ⋮</b> فوق على الجنب.
        </li>
        <li>
          اختار <b>«تثبيت التطبيق»</b> أو «إضافة إلى الشاشة الرئيسية» ← «تثبيت».
        </li>
      </ol>
    );
  return (
    <ol className="list-decimal space-y-1.5 pe-5">
      <li>
        افتح البرنامج من <b>Chrome</b> أو <b>Edge</b>.
      </li>
      <li>
        في شريط العنوان فوق (جنب الرابط) هتلاقي أيقونة <b>شاشة عليها سهم</b> — دوس عليها ← «تثبيت».
      </li>
      <li>
        مش ظاهرة؟ دوس <b>النقط التلاتة ⋮</b> ← «تثبيت {APP_NAME}» (أو «التطبيقات» ← «تثبيت هذا
        الموقع كتطبيق»).
      </li>
      <li>لو لسه مش ظاهرة: اعمل تحديث للصفحة (F5) وجرب تاني.</li>
    </ol>
  );
}

/** شباك بسيط فوق الصفحة (المشروع مفيهوش مكوّن شباك جاهز). */
export function SimpleDialog({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open || typeof document === "undefined") return null;
  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
      dir="rtl"
    >
      <div
        role="dialog"
        aria-modal="true"
        className="w-full max-w-md rounded-xl bg-card p-5 text-card-foreground shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="flex items-center gap-2 text-base font-bold">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="قفل"
            className="rounded-md p-1 text-muted-foreground hover:bg-muted"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="mt-3 text-sm leading-7">{children}</div>
      </div>
    </div>,
    document.body,
  );
}

export function InstallAppButton({
  compact = false,
  className,
}: {
  /** أيقونة بس (الشريط اللي فوق على التليفون). */
  compact?: boolean;
  className?: string;
}) {
  const state = useInstallState();
  const [open, setOpen] = useState(false);
  const [help, setHelp] = useState(false);
  // نفس الشكل في أول رسم على السيرفر والجهاز؛ الحالة الحقيقية بعد ما الصفحة تتركّب.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const d = device();
  const standalone = mounted && state === "standalone";

  async function onClick() {
    if (state === "prompt") {
      const done = await installApp();
      if (done) {
        setHelp(false);
        setOpen(true); // فين يلاقيه من دلوقتي
      }
      return; // اتداس إلغاء: الزرار فاضل، والضغطة الجاية بتعرض الخطوات
    }
    setHelp(false);
    setOpen(true);
  }

  const installed = (state === "installed" || state === "standalone") && !help;

  return (
    <>
      <button
        type="button"
        onClick={() => void onClick()}
        title={standalone ? "البرنامج متسطّب" : "تسطيب البرنامج على الجهاز"}
        data-testid="install-app"
        className={cn(
          "flex items-center justify-center gap-2 rounded-md text-xs font-bold transition-colors",
          compact
            ? "h-9 w-9 text-current hover:bg-white/10"
            : standalone
              ? "w-full px-3 py-1.5 text-sidebar-foreground/70 hover:bg-sidebar-accent"
              : "w-full bg-primary px-3 py-1.5 text-primary-foreground hover:bg-primary/90",
          className,
        )}
      >
        {standalone ? (
          <CheckCircle2 className="h-4 w-4 shrink-0" />
        ) : (
          <MonitorDown className="h-4 w-4 shrink-0" />
        )}
        {!compact && (standalone ? "البرنامج متسطّب" : "تسطيب البرنامج على الجهاز")}
      </button>
      <SimpleDialog
        open={open}
        onClose={() => setOpen(false)}
        title={
          installed ? (
            <>
              <CheckCircle2 className="h-5 w-5 text-success" />
              {state === "standalone" ? "البرنامج متسطّب بالفعل" : "البرنامج متسطّب على جهازك"}
            </>
          ) : (
            <>
              <MonitorDown className="h-5 w-5 text-primary" /> تسطيب البرنامج على الجهاز
            </>
          )
        }
      >
        {state === "standalone" && !help ? (
          <p>البرنامج متسطّب بالفعل وإنت فاتحه منه دلوقتي ✅ — مش محتاج تعمل أي حاجة.</p>
        ) : (
          <>
            <p className="mb-2 text-muted-foreground">
              {installed
                ? `«${APP_FULL_NAME}» متسطّب على الجهاز ده ✅ افتحه من هنا:`
                : `خطوات بسيطة وهيبقى عندك «${APP_FULL_NAME}» بأيقونة زي أي برنامج، ويفتح حتى من غير نت.`}
            </p>
            {installed ? <WhereItIs d={d} /> : <HowToInstall d={d} />}
          </>
        )}
        {installed && state !== "standalone" && (
          <button
            type="button"
            className="mt-3 text-start text-sm text-primary hover:underline"
            onClick={() => setHelp(true)}
          >
            مش لاقيه؟ اعرض خطوات التسطيب من الأول
          </button>
        )}
      </SimpleDialog>
    </>
  );
}
