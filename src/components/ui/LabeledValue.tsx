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
 * (زي ↑/↓ لاتجاه حركة الخزينة) تتلوّن بنفس لون الـtone، بدل ما كل مستخدِم يضيف أيقونته يدويًا.
 *
 * `min-w-fit` على الغلاف الخارجي مش تجميلي — ده الإصلاح الحقيقي لباگ "النص بيختفي عند الزوم":
 * أي عنصر Grid/Flex عنده `overflow` غير `visible` (زي `overflow-hidden` هنا، لازم يفضل عشان
 * يقص زوايا الخانتين الملوّنتين على استدارة الكارت) بييجي افتراضيًا بـ`min-width: 0` مش
 * `min-width: auto` — يعني أي Grid أبوه (زي شبكة كروت الإقفال اليومي) كان يقدر يضغطه لعرض شبه
 * صفري وقت الزوم، وبما إنه overflow-hidden، أي حاجة جوّاه كانت بتتقص/تختفي بصمت. `min-w-fit`
 * بيرجّع الحد الأدنى الطبيعي (حسب المحتوى) فيمنع الانضغاط الصفري ده، من غير ما يشيل خاصية
 * القص نفسها. */
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
    <div className="flex min-w-fit overflow-hidden rounded-xl border-2 border-border">
      <div className="min-w-0 flex-1 border-l-2 border-border bg-muted/30 px-3 py-2.5">
        <p className="text-xs font-extrabold leading-snug text-[#1b2a41]">{label}</p>
      </div>
      <div className="flex min-w-0 items-center gap-1.5 bg-card px-3 py-2.5">
        {Icon && <Icon className={cn("h-4 w-4 shrink-0", TONE_VALUE[tone])} />}
        <p className={cn("break-words text-base font-extrabold", TONE_VALUE[tone])} dir={valueDir}>
          {value}
        </p>
      </div>
    </div>
  );
}
