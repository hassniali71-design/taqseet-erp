import { cn } from "@/lib/utils";

/**
 * شعار هوية "حسبة" (HESBA) — آلة حاسبة يلتف حولها شريط ذهبي/تركواز. الألوان ثابتة
 * (مش currentColor) لأنها هوية بصرية معتمدة، وتقرأ بوضوح على الخلفية الفاتحة (كريمي)
 * والداكنة (كحلي) على حد سواء. النص (وردمارك) وحده يتبع currentColor عشان يتلوّن
 * حسب مكان استخدامه (شريط جانبي كحلي مقابل صفحة دخول فاتحة).
 */
export function LogoIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" fill="none" className={className} aria-hidden="true">
      <rect x="14" y="8" width="36" height="48" rx="7" fill="#1B2A41" />
      <rect x="19" y="14" width="26" height="12" rx="2.5" fill="#F3EFE7" />
      <g fill="#D4AA17">
        <rect x="19" y="30" width="6.5" height="6.5" rx="1.5" />
        <rect x="28.75" y="30" width="6.5" height="6.5" rx="1.5" />
        <rect x="38.5" y="30" width="6.5" height="6.5" rx="1.5" />
        <rect x="19" y="39.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="28.75" y="39.5" width="6.5" height="6.5" rx="1.5" />
        <rect x="19" y="49" width="16.25" height="6.5" rx="1.5" />
      </g>
      <rect x="38.5" y="39.5" width="6.5" height="15.5" rx="1.5" fill="#16A3B0" />
      <path
        d="M6 44C6 44 16 50 16 38C16 26 6 32 6 20C6 12 14 8 22 9"
        stroke="#D4AA17"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M11 46C11 46 21 52 21 40C21 28 11 34 11 22C11 14 19 10 27 11"
        stroke="#16A3B0"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
        opacity="0.85"
      />
      <rect x="47" y="10" width="4" height="4" rx="1" fill="#D4AA17" />
      <rect x="53" y="16" width="3" height="3" rx="0.75" fill="#16A3B0" />
    </svg>
  );
}

export function Logo({
  className,
  iconClassName,
  showTagline = true,
}: {
  className?: string;
  iconClassName?: string;
  showTagline?: boolean;
}) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoIcon className={cn("h-9 w-9 shrink-0", iconClassName)} />
      <div className="flex flex-col leading-tight">
        <span className="text-lg font-extrabold tracking-tight">حسبة</span>
        {showTagline && (
          <span className="text-[10px] font-bold tracking-[0.2em] opacity-70">HESBA</span>
        )}
      </div>
    </div>
  );
}
