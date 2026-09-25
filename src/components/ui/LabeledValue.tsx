import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "danger";

const TONE_VALUE: Record<Tone, string> = {
  default: "text-foreground",
  primary: "text-primary",
  success: "text-success",
  danger: "text-destructive",
};

/** زوج "وصف/رقم" أفقي بحدود مشتركة — بديل موحّد لنمط "<p>وصف</p><p>رقم</p>" العمودي اليدوي
 * المتكرر في صفحات زي الشركاء/الخزينة/المصروفات. الوصف بلون كحلي (هوية HESBA — نفس `#1b2a41`
 * المُستخدَم لكروت `StatCard` tone="navy") بدل الرمادي الافتراضي، ويلف على أكتر من سطر لو طويل
 * (الخانة بتكبر في الطول مش بتتقص)، والرقم بارز جنبه مش تحته. `icon` اختياري — شارة صغيرة
 * (زي ↑/↓ لاتجاه حركة الخزينة) تتلوّن بنفس لون الـtone، بدل ما كل مستخدِم يضيف أيقونته يدويًا. */
export function LabeledValue({
  label,
  value,
  valueDir,
  tone = "default",
  icon: Icon,
}: {
  label: string;
  value: string;
  valueDir?: "ltr" | "rtl";
  tone?: Tone;
  icon?: LucideIcon;
}) {
  return (
    <div className="flex overflow-hidden rounded-xl border-2 border-border">
      <div className="min-w-0 flex-1 border-l-2 border-border bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-extrabold leading-snug text-[#1b2a41]">{label}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 bg-card px-3 py-2.5">
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", TONE_VALUE[tone])} />}
        <p
          className={cn("whitespace-nowrap text-base font-extrabold", TONE_VALUE[tone])}
          dir={valueDir}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
