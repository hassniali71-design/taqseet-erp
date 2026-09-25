import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import type { CustomerRiskAssessment, CustomerRiskLevel } from "@/lib/data-store";
import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "danger" | "navy" | "teal";

/** "navy"/"teal" are solid HESBA-brand-colored cards (dark background) instead of the usual
 * light/white tinted ones — the identity explicitly wants stat/KPI cards to read as colored,
 * not plain white, with white reserved for simple things. Text colors for these two are
 * self-contained (TONE_TEXT below), never the shared text-foreground/text-muted-foreground
 * classes tuned for a light background. */
const TONE_CARD: Record<Tone, string> = {
  default: "border-border bg-card",
  primary: "border-primary/50 bg-primary/5",
  success: "border-success/40 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  danger: "border-destructive/40 bg-destructive/5",
  navy: "border-transparent bg-[#1b2a41]",
  teal: "border-transparent bg-[#16a3b0]",
};

const TONE_ICON: Record<Tone, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
  navy: "bg-[#d4aa17] text-[#111417]",
  teal: "bg-[#d4aa17] text-[#111417]",
};

const TONE_TEXT: Record<Tone, { label: string; value: string; sub: string; cta: string }> = {
  default: {
    label: "text-muted-foreground",
    value: "text-foreground",
    sub: "text-muted-foreground",
    cta: "text-primary",
  },
  primary: {
    label: "text-muted-foreground",
    value: "text-foreground",
    sub: "text-muted-foreground",
    cta: "text-primary",
  },
  success: {
    label: "text-muted-foreground",
    value: "text-success",
    sub: "text-muted-foreground",
    cta: "text-primary",
  },
  warning: {
    label: "text-muted-foreground",
    value: "text-foreground",
    sub: "text-muted-foreground",
    cta: "text-primary",
  },
  danger: {
    label: "text-muted-foreground",
    value: "text-destructive",
    sub: "text-muted-foreground",
    cta: "text-primary",
  },
  navy: {
    label: "text-white/70",
    value: "text-white",
    sub: "text-white/70",
    cta: "text-[#d4aa17]",
  },
  teal: {
    label: "text-[#0d2f34]/70",
    value: "text-[#0d2f34]",
    sub: "text-[#0d2f34]/70",
    cta: "text-[#1b2a41]",
  },
};

/** كرت إحصائية بهوية "حسبة": حدود سميكة، أرقام بخط Almarai البارز، شارة أيقونة ملوّنة. */
export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  valueDir,
}: {
  label: string;
  value: string;
  sub?: string;
  icon?: LucideIcon;
  tone?: Tone;
  valueDir?: "ltr" | "rtl";
}) {
  const text = TONE_TEXT[tone];
  return (
    <div className={cn("rounded-2xl border-2 p-4 shadow-sm", TONE_CARD[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn("text-xs font-extrabold", text.label)}>{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONE_ICON[tone],
            )}
          >
            <Icon className="h-4 w-4" />
          </span>
        )}
      </div>
      <p
        className={cn("font-stat mt-2 text-2xl font-extrabold", text.value)}
        {...(valueDir && { dir: valueDir })}
      >
        {value}
      </p>
      {sub && <p className={cn("mt-1 text-xs font-bold", text.sub)}>{sub}</p>}
    </div>
  );
}

/** لوحة محتوى بهوية "حسبة": نفس الحدود السميكة وعنوان بخط Cairo. */
export function Panel({
  title,
  description,
  actions,
  children,
  className,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("rounded-2xl border-2 border-border bg-card p-5 shadow-sm", className)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-extrabold text-foreground">{title}</h2>
          {description && (
            <p className="mt-0.5 text-xs font-bold text-muted-foreground">{description}</p>
          )}
        </div>
        {actions}
      </div>
      <div className="mt-4">{children}</div>
    </div>
  );
}

export function LinkCard({
  label,
  value,
  sub,
  cta,
  icon: Icon,
  tone = "primary",
  valueDir,
}: {
  label: string;
  value: string;
  sub?: string;
  cta: string;
  icon?: LucideIcon;
  tone?: Tone;
  valueDir?: "ltr" | "rtl";
}) {
  const text = TONE_TEXT[tone];
  return (
    <div
      className={cn(
        "rounded-2xl border-2 p-5 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md",
        TONE_CARD[tone],
      )}
    >
      <div className="flex items-center justify-between">
        <p className={cn("text-sm font-bold", text.label)}>{label}</p>
        {Icon && (
          <span
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
              TONE_ICON[tone],
            )}
          >
            <Icon className="h-4.5 w-4.5" />
          </span>
        )}
      </div>
      <p
        className={cn("font-stat mt-2 text-3xl font-extrabold", text.value)}
        {...(valueDir && { dir: valueDir })}
      >
        {value}
      </p>
      {sub && <p className={cn("mt-1 text-xs font-bold", text.sub)}>{sub}</p>}
      <p className={cn("mt-2 text-xs font-extrabold", text.cta)}>{cta}</p>
    </div>
  );
}

const RISK_BADGE_CLASS: Record<CustomerRiskLevel, string> = {
  excellent: "bg-success/15 text-success",
  good: "bg-primary/15 text-primary",
  watch: "bg-warning/15 text-warning",
  critical: "bg-destructive/15 text-destructive",
};

/** §17 Risk Score badge — always pass the full assessment (not just the level) so `title`
 * carries the "why" on hover instead of a bare, unexplained label. */
export function RiskBadge({ assessment }: { assessment: CustomerRiskAssessment }) {
  return (
    <span
      title={assessment.reasons.join(" — ")}
      className={cn(
        "rounded-full px-2 py-0.5 text-xs font-extrabold",
        RISK_BADGE_CLASS[assessment.level],
      )}
    >
      {assessment.label}
    </span>
  );
}
