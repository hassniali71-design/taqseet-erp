import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

import { cn } from "@/lib/utils";

type Tone = "default" | "primary" | "success" | "warning" | "danger";

const TONE_CARD: Record<Tone, string> = {
  default: "border-border bg-card",
  primary: "border-primary/50 bg-primary/5",
  success: "border-success/40 bg-success/5",
  warning: "border-warning/40 bg-warning/5",
  danger: "border-destructive/40 bg-destructive/5",
};

const TONE_ICON: Record<Tone, string> = {
  default: "bg-muted text-foreground",
  primary: "bg-primary text-primary-foreground",
  success: "bg-success text-success-foreground",
  warning: "bg-warning text-warning-foreground",
  danger: "bg-destructive text-destructive-foreground",
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
  return (
    <div className={cn("rounded-2xl border-2 p-4 shadow-sm", TONE_CARD[tone])}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-extrabold text-muted-foreground">{label}</p>
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
        className="font-stat mt-2 text-2xl font-extrabold text-foreground"
        {...(valueDir && { dir: valueDir })}
      >
        {value}
      </p>
      {sub && <p className="mt-1 text-xs font-bold text-muted-foreground">{sub}</p>}
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
  cta,
  icon: Icon,
  tone = "primary",
}: {
  label: string;
  value: string;
  cta: string;
  icon?: LucideIcon;
  tone?: Tone;
}) {
  return (
    <div className={cn("rounded-2xl border-2 p-5 shadow-sm transition-colors", TONE_CARD[tone])}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-bold text-muted-foreground">{label}</p>
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
      <p className="font-stat mt-2 text-3xl font-extrabold text-foreground">{value}</p>
      <p className="mt-2 text-xs font-extrabold text-primary">{cta}</p>
    </div>
  );
}
