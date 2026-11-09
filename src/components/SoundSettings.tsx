/** التحكم في الأصوات والاهتزاز (src/lib/sounds.ts) — لكل جهاز لوحده (بند 82، منقول من
 * دكانة/سفرة `sound-settings.tsx`؛ المشروع ده مفيهوش مكوّنات Card/Switch/Slider الجاهزة، فاتكتب
 * بعناصر عادية بنفس الشكل والسلوك).
 *  - SoundToggleButton: أيقونة سماعة (الشريط اللي فوق على التليفون + القايمة الجانبية).
 *  - SoundSettingsCard: كارت كامل في الإعدادات (تشغيل، ومستوى الصوت، واهتزاز، وتجربة كل صوت). */
import { Volume2, VolumeX } from "lucide-react";
import { useSoundSettings } from "@/hooks/use-sound-settings";
import { playSound, setSoundSettings, type SoundName } from "@/lib/sounds";
import { cn } from "@/lib/utils";

export function SoundToggleButton({ className }: { className?: string }) {
  const { enabled } = useSoundSettings();
  return (
    <button
      type="button"
      className={cn("flex h-9 w-9 items-center justify-center rounded-md", className)}
      aria-label={enabled ? "اقفل الصوت" : "شغّل الصوت"}
      title={enabled ? "الصوت شغال — دوس عشان تقفله" : "الصوت مقفول — دوس عشان تشغّله"}
      onClick={() => {
        setSoundSettings({ enabled: !enabled });
        if (!enabled) playSound("tap");
      }}
    >
      {enabled ? <Volume2 className="h-5 w-5" /> : <VolumeX className="h-5 w-5" />}
    </button>
  );
}

const SAMPLES: { name: SoundName; label: string }[] = [
  { name: "click", label: "ضغطة زرار" },
  { name: "key", label: "كتابة" },
  { name: "tap", label: "إضافة جهاز" },
  { name: "success", label: "تمام البيع / التحصيل" },
  { name: "done", label: "حفظ / مستني النت" },
  { name: "error", label: "غلطة" },
  { name: "ding", label: "تنبيه" },
  { name: "bell", label: "جرس" },
];

function Toggle({
  id,
  label,
  checked,
  disabled,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <label
      htmlFor={id}
      className={cn("flex items-center justify-between gap-4", disabled && "opacity-50")}
    >
      <span className="text-sm font-medium text-foreground">{label}</span>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative h-6 w-11 shrink-0 rounded-full transition-colors",
          checked ? "bg-primary" : "bg-muted-foreground/30",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all",
            checked ? "right-[1.375rem]" : "right-0.5",
          )}
        />
      </button>
    </label>
  );
}

export function SoundSettingsCard() {
  const s = useSoundSettings();
  return (
    <section className="rounded-xl border border-border bg-card p-5 shadow-sm">
      <h2 className="text-lg font-bold text-foreground">الأصوات والاهتزاز</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        الإعداد ده للجهاز ده بس. كل واحد يظبط تليفونه على مزاجه.
      </p>
      <div className="mt-4 space-y-5">
        <Toggle
          id="snd-on"
          label="أصوات البرنامج"
          checked={s.enabled}
          onChange={(v) => setSoundSettings({ enabled: v })}
        />
        <label className={cn("block space-y-2", !s.enabled && "opacity-50")}>
          <span className="text-sm font-medium text-foreground">
            مستوى الصوت: {Math.round(s.volume * 100)}%
          </span>
          <input
            type="range"
            min={0}
            max={100}
            step={5}
            disabled={!s.enabled}
            value={Math.round(s.volume * 100)}
            onChange={(e) => setSoundSettings({ volume: Number(e.target.value) / 100 })}
            onPointerUp={() => playSound("tap")}
            className="w-full accent-primary"
          />
        </label>
        <Toggle
          id="snd-click"
          label="صوت ضغطة الزراير والأيقونات"
          disabled={!s.enabled}
          checked={s.clicks}
          onChange={(v) => setSoundSettings({ clicks: v })}
        />
        <Toggle
          id="snd-type"
          label="صوت وإنت بتكتب"
          disabled={!s.enabled}
          checked={s.typing}
          onChange={(v) => setSoundSettings({ typing: v })}
        />
        <Toggle
          id="snd-vib"
          label="اهتزاز (أندرويد)"
          checked={s.vibrate}
          onChange={(v) => setSoundSettings({ vibrate: v })}
        />
        <div className="space-y-2">
          <span className="text-sm font-medium text-foreground">جرّب الأصوات</span>
          <div className="flex flex-wrap gap-2">
            {SAMPLES.map((x) => (
              <button
                key={x.name}
                type="button"
                onClick={() => playSound(x.name)}
                className="rounded-md border border-input px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent"
              >
                {x.label}
              </button>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
