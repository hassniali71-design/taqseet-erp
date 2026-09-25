import { useState } from "react";
import { ArrowDownCircle, ArrowUpCircle, ArrowUpDown } from "lucide-react";

import { Panel } from "@/components/ui/StatCard";
import { cn } from "@/lib/utils";

type Direction = "in" | "out" | "variable";

interface GuideEntry {
  id: string;
  tabLabel: string;
  title: string;
  direction: Direction;
  summary: string;
  source: string;
  effect: string;
  whereShown: string;
  note: string;
}

/** محتوى ثابت — مبني حرفيًا على أنواع treasury_movements.type التسعة الحقيقية الموجودة في
 * الـSchema (0019_treasury_partners_governance.sql) وعلى نفس منطق الإشارة المستخدَم في
 * performPostTreasuryMovement (supabase-queries.ts). لا استعلام جديد، لا منطق مالي جديد — ده
 * شرح لسلوك موجود بالفعل، بديل عن الكارت التعريفي الطويل اللي كان قبل كده. */
const GUIDE_ENTRIES: GuideEntry[] = [
  {
    id: "cash-sale",
    tabLabel: "البيع النقدي",
    title: "بيع نقدي",
    direction: "in",
    summary: "عميل بيشتري ويدفع كامل المبلغ على طول — مش تقسيط.",
    source: 'شاشة "بيع جديد" عند تأكيد فاتورة كاش.',
    effect: 'إجمالي الفاتورة بيتسجّل كحركة "بيع" (نوع sale) وبيزيد رصيد خزينة الكاشير فورًا.',
    whereShown: 'سجل حركة الخزينة، وقسم "بعنا بكام" في نظرة عامة، وتقرير المبيعات.',
    note: 'لو الفاتورة اتلغت بمرتجع بعد كده، الاسترجاع بيتسجّل حركة "مرتجع" منفصلة بتقلّل الرصيد تاني — مش تعديل في حركة البيع الأصلية.',
  },
  {
    id: "installment-down-payment",
    tabLabel: "التقسيط",
    title: "المقدّم عند فتح عقد تقسيط",
    direction: "in",
    summary: "مش قيمة العقد كلها بتدخل الخزينة — بس المقدّم اللي العميل دفعه وقت فتح العقد.",
    source: 'شاشة "بيع بالتقسيط" عند تأكيد العقد.',
    effect:
      'المقدّم بس بيتسجّل حركة "بيع" (نفس النوع اللي بيستخدمه البيع النقدي) وبيزيد رصيد الخزينة. باقي قيمة العقد بتدخل تدريجيًا مع كل قسط.',
    whereShown:
      'سجل حركة الخزينة، وقسم "بعنا بكام (كاش + تقسيط)" اللي بيحسب قيمة العقد كاملة كمبيعات — لكن الخزينة نفسها بتاخد المقدّم بس.',
    note: 'لو العقد اتلغى بالكامل (زر "إلغاء العقد") قبل أي تحصيل، المقدّم بيترجّع كحركة "مرتجع" بتقلّل الرصيد.',
  },
  {
    id: "collection",
    tabLabel: "التحصيل",
    title: "تحصيل قسط",
    direction: "in",
    summary: "عميل بيدفع قسط مستحق على عقد تقسيط قائم.",
    source: 'شاشة "التحصيل" عند تسجيل دفعة قسط.',
    effect: 'مبلغ القسط المُحصَّل بيتسجّل حركة "تحصيل" وبيزيد رصيد الخزينة فورًا.',
    whereShown: "سجل حركة الخزينة، وصفحة تفاصيل العقد (سجل الدفعات).",
    note: "التسوية المبكرة لعقد كامل بتتسجّل بنفس النوع (تحصيل) بمبلغ المتبقي كله دفعة واحدة.",
  },
  {
    id: "suppliers",
    tabLabel: "الموردون",
    title: "دفعة لمورد",
    direction: "out",
    summary: "دفع فلوس لمورد — سواء فوري وقت الشراء أو دفعة لاحقة على رصيد قائم.",
    source: 'شاشة "شراء جديد" (دفعة فورية اختيارية)، أو صفحة المورد (تسجيل دفعة).',
    effect: 'المبلغ المدفوع بيتسجّل حركة "دفعة لمورد" وبيقلّل رصيد الخزينة (خزينة رئيسية عادةً).',
    whereShown: "سجل حركة الخزينة، وصفحة المورد (رصيده المتبقي).",
    note: 'شراء البضاعة نفسها ممكن يتموّل من شريك بدل الخزينة — في الحالة دي الحركة بتتسجّل في دفتر الشريك (شوف تاب "الشركاء")، مش هنا خالص.',
  },
  {
    id: "expenses",
    tabLabel: "المصروفات",
    title: "مصروف",
    direction: "out",
    summary: "أي مصروف تشغيلي — إيجار، صيانة، مواصلات، إلخ.",
    source: 'شاشة "المصروفات" عند تسجيل مصروف جديد، لو اختَرت "خزينة" كمصدر التحميل.',
    effect: 'المبلغ بيتسجّل حركة "مصروف" وبيقلّل رصيد الخزينة المُختارة.',
    whereShown: "سجل حركة الخزينة، وصفحة المصروفات.",
    note: 'لو اختَرت "تحميل على شركاء" بدل خزينة وقت تسجيل المصروف، الحركة دي مش هتظهر هنا خالص — هتتسجّل في دفتر الشركاء بس، والخزينة مش بتتأثر إطلاقًا.',
  },
  {
    id: "transfer",
    tabLabel: "التحويلات",
    title: "تحويل بين خزينتين",
    direction: "variable",
    summary: "نقل جزء من رصيد خزينة الكاشير لخزينة تانية — بيحصل وقت إقفال الوردية.",
    source: 'فورم "إقفال الوردية" لو اخترت خزينة وجهة للمبلغ المعدود.',
    effect:
      "حركتان مرتبطتان بنفس المبلغ: خصم من خزينة الكاشير + إضافة لنفس القيمة في الخزينة الوجهة — الإجمالي الكلي للخزائن مع بعضها ثابت، الفلوس بتتنقل بين حسابات مش بتزيد أو تقل فعليًا.",
    whereShown: "سجل حركة الخزينة (حركتان منفصلتان بنفس المبلغ)، وسجل الورديات المقفلة.",
    note: "لو مفيش خزينة وجهة اتخْتارت وقت الإقفال، المبلغ المعدود يفضل كله في الكاشير — مفيش حركة تحويل بتتسجّل أصلًا.",
  },
  {
    id: "returns-exchanges",
    tabLabel: "المرتجعات والاستبدال",
    title: "مرتجع واستبدال",
    direction: "variable",
    summary: "استرجاع بيع (فلوس ترجع للعميل)، أو استبدال جهاز بجهاز تاني بفرق سعر.",
    source: 'شاشة تفاصيل الفاتورة (زر إرجاع)، أو شاشة "استبدال".',
    effect:
      'المرتجع دايمًا بيقلّل الرصيد (حركة "مرتجع"، فلوس بترجع للعميل). الاستبدال بيسجّل "فرق السعر" بس — لو الجهاز الجديد أغلى العميل بيدفع فرق (زيادة في الرصيد)، ولو أرخص بيترجّعله فرق (نقص في الرصيد).',
    whereShown: "سجل حركة الخزينة، وصفحة الفاتورة الأصلية.",
    note: "استبدال بنفس السعر بالظبط (فرق = صفر) مش بيسجّل أي حركة خزينة خالص.",
  },
  {
    id: "partners",
    tabLabel: "الشركاء",
    title: "صرف أرباح لشريك",
    direction: "out",
    summary: "تحويل جزء من أرباح شريك المستحقة له فعليًا من خزينة حقيقية لحسابه.",
    source: 'صفحة تفاصيل الشريك، زر "صرف أرباح".',
    effect: 'المبلغ المصروف بيتسجّل حركة "صرف أرباح لشريك" وبيقلّل رصيد الخزينة المُختارة.',
    whereShown: "سجل حركة الخزينة، وسجل حركات الشريك (قسم الأرباح المدفوعة).",
    note: "ده النوع الوحيد اللي بيربط الشركاء بالخزينة فعليًا — تمويل الشريك، وشراء البضاعة بفلوسه، وحساب نصيبه من الربح، كل ده بيتسجّل في دفتر الشريك المنفصل بس، وملوش أي أثر على رصيد الخزينة هنا.",
  },
  {
    id: "opening",
    tabLabel: "الرصيد الافتتاحي",
    title: "رصيد افتتاحي لخزينة جديدة",
    direction: "in",
    summary: "أول رصيد بتدخله لخزينة جديدة وقت إنشائها.",
    source: 'فورم "+ إضافة خزينة" — حقل "رصيد افتتاحي" (اختياري).',
    effect:
      'لو دخلت رقم أكبر من صفر، بيتسجّل حركة "رصيد افتتاحي" وحيدة بتزيد رصيد الخزينة الجديدة بنفس القيمة.',
    whereShown: "سجل حركة الخزينة (أول حركة لأي خزينة جديدة).",
    note: "لو سبت الحقل فاضي أو صفر، الخزينة بتتعمل برصيد صفر من غير أي حركة تتسجّل.",
  },
];

const DIRECTION_META: Record<
  Direction,
  { label: string; icon: typeof ArrowUpCircle; badgeClass: string }
> = {
  in: {
    label: "وارد — بيزيد الرصيد",
    icon: ArrowUpCircle,
    badgeClass: "bg-success/15 text-success",
  },
  out: {
    label: "صادر — بيقلّل الرصيد",
    icon: ArrowDownCircle,
    badgeClass: "bg-destructive/15 text-destructive",
  },
  variable: {
    label: "متغيّر — حسب الحالة",
    icon: ArrowUpDown,
    badgeClass: "bg-warning/15 text-warning",
  },
};

function GuideCard({ entry }: { entry: GuideEntry }) {
  const meta = DIRECTION_META[entry.direction];
  const Icon = meta.icon;
  return (
    <div className="rounded-xl border-2 border-border bg-muted/20 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-extrabold text-foreground">{entry.title}</h3>
        <span
          className={cn(
            "flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold",
            meta.badgeClass,
          )}
        >
          <Icon className="h-3.5 w-3.5" />
          {meta.label}
        </span>
      </div>
      <p className="mt-2 text-sm text-foreground">{entry.summary}</p>
      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="font-bold text-muted-foreground">المصدر</dt>
          <dd className="mt-0.5 text-foreground">{entry.source}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted-foreground">الأثر على الرصيد</dt>
          <dd className="mt-0.5 text-foreground">{entry.effect}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted-foreground">فين بتظهر</dt>
          <dd className="mt-0.5 text-foreground">{entry.whereShown}</dd>
        </div>
        <div>
          <dt className="font-bold text-muted-foreground">ملاحظة</dt>
          <dd className="mt-0.5 text-muted-foreground">{entry.note}</dd>
        </div>
      </dl>
    </div>
  );
}

/** دليل الخزينة — بديل عن الكارت التعريفي الطويل، بنفس نمط الـTabs اليدوي المستخدَم في
 * reports.tsx (مجموعة أزرار + state، بدون مكوّن Tabs جاهز في المشروع). */
export function TreasuryGuide() {
  const [activeId, setActiveId] = useState(GUIDE_ENTRIES[0]!.id);
  const active = GUIDE_ENTRIES.find((e) => e.id === activeId) ?? GUIDE_ENTRIES[0]!;

  return (
    <Panel title="دليل الخزينة" description="اختار نوع الحركة عشان تشوف تأثيرها بالظبط">
      <div className="flex flex-wrap gap-2">
        {GUIDE_ENTRIES.map((entry) => (
          <button
            key={entry.id}
            type="button"
            onClick={() => setActiveId(entry.id)}
            className={cn(
              "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
              activeId === entry.id
                ? "bg-primary text-primary-foreground"
                : "border border-input text-foreground hover:bg-accent",
            )}
          >
            {entry.tabLabel}
          </button>
        ))}
      </div>
      <div className="mt-4">
        <GuideCard entry={active} />
      </div>
    </Panel>
  );
}
