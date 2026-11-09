/**
 * أصوات واهتزاز البرنامج — ملف واحد، نفسه بالظبط في دكانة وسفرة.
 *
 * الأصوات بتتعمل بالكود (Web Audio): مفيش ملفات صوت، فالبرنامج مايتقلش ومفيش حقوق.
 * الاهتزاز بـ navigator.vibrate (أندرويد بس؛ الآيفون بيتجاهله من غير مشاكل).
 *
 * الاختيارات (تشغيل/قفل، ومستوى الصوت، والاهتزاز) لكل جهاز لوحده في localStorage:
 * الطباخ يعلّي، والكاشير يوطّي.
 *
 * المتصفح مش بيسمح بصوت قبل أول لمسة على الصفحة؛ فبنجهّز الصوت مع أول لمسة.
 * `isSoundReady()` بتقول لو لسه محتاجين لمسة (صفحة المطبخ بتطلب لمسة عشان الجرس).
 */

export type SoundName = "tap" | "success" | "error" | "done" | "ding" | "bell" | "click" | "key";

type Tone = {
  freq: number;
  /** بداية النغمة بالثواني من دلوقتي */
  at: number;
  dur: number;
  type?: OscillatorType;
  gain?: number;
  /** نهاية النغمة (لو عاوزينها تنزلق) */
  toFreq?: number;
};

/** النغمات: قصيرة وخفيفة. الأرقام اتختارت عشان تبقى واضحة على سماعة التليفون الصغيرة. */
const TONES: Record<SoundName, Tone[]> = {
  // ضغطة أي زرار / أيقونة / قايمة: «طق» خفيفة جداً
  click: [{ freq: 2200, at: 0, dur: 0.018, type: "sine", gain: 0.25 }],
  // كل حرف وإنت بتكتب: أخف من الضغطة
  key: [{ freq: 3000, at: 0, dur: 0.012, type: "sine", gain: 0.12 }],
  // إضافة صنف / قراءة باركود: «تك»
  tap: [{ freq: 1400, at: 0, dur: 0.045, type: "sine", gain: 0.5 }],
  // تمام البيع: «تشا-تشينج»
  success: [
    { freq: 1319, at: 0, dur: 0.09, type: "triangle", gain: 0.7 },
    { freq: 1760, at: 0.08, dur: 0.22, type: "triangle", gain: 0.8 },
    { freq: 3520, at: 0.08, dur: 0.18, type: "sine", gain: 0.15 },
  ],
  // غلطة: نغمتين واطيين نازلين
  error: [
    { freq: 330, at: 0, dur: 0.14, type: "square", gain: 0.25 },
    { freq: 247, at: 0.15, dur: 0.22, type: "square", gain: 0.25 },
  ],
  // حفظ / تقفيل: «تمّ» طالعة
  done: [
    { freq: 784, at: 0, dur: 0.1, type: "sine", gain: 0.6 },
    { freq: 988, at: 0.09, dur: 0.1, type: "sine", gain: 0.6 },
    { freq: 1175, at: 0.18, dur: 0.2, type: "sine", gain: 0.6 },
  ],
  // أوردر جاهز: «دينج»
  ding: [
    { freq: 1568, at: 0, dur: 0.8, type: "sine", gain: 0.8 },
    { freq: 3136, at: 0, dur: 0.4, type: "sine", gain: 0.2 },
  ],
  // جرس المطبخ: «دينج-دينج»
  bell: [
    { freq: 1760, at: 0, dur: 0.5, type: "sine", gain: 0.9 },
    { freq: 3520, at: 0, dur: 0.25, type: "sine", gain: 0.2 },
    { freq: 1760, at: 0.35, dur: 0.7, type: "sine", gain: 0.9 },
    { freq: 3520, at: 0.35, dur: 0.3, type: "sine", gain: 0.2 },
  ],
};

/** الاهتزاز لكل صوت (مللي ثانية: هز، وقفة، هز…) */
const VIBRATION: Record<SoundName, number | number[]> = {
  click: 8,
  key: 0,
  tap: 15,
  success: [40, 60, 40],
  error: [180],
  done: 30,
  ding: [60, 80, 60],
  bell: [300, 150, 300],
};

// ---------------------------------------------------------------- الإعدادات
const KEY_ENABLED = "app_sound_enabled";
const KEY_VOLUME = "app_sound_volume";
const KEY_VIBRATE = "app_vibrate_enabled";
const KEY_CLICKS = "app_click_sounds";
const KEY_TYPING = "app_typing_sounds";

export type SoundSettings = {
  enabled: boolean;
  volume: number;
  vibrate: boolean;
  /** صوت ضغطة لأي زرار أو أيقونة أو قايمة */
  clicks: boolean;
  /** صوت خفيف مع كل حرف وإنت بتكتب */
  typing: boolean;
};
export const DEFAULT_SOUND_SETTINGS: SoundSettings = {
  enabled: true,
  volume: 0.6,
  vibrate: true,
  clicks: true,
  typing: true,
};
const DEFAULTS = DEFAULT_SOUND_SETTINGS;

function flag(s: Storage, key: string, fallback: boolean): boolean {
  const v = s.getItem(key);
  return v === null ? fallback : v === "1";
}

function storage(): Storage | undefined {
  try {
    return typeof localStorage === "undefined" ? undefined : localStorage;
  } catch {
    return undefined;
  }
}

export function getSoundSettings(): SoundSettings {
  const s = storage();
  if (!s) return { ...DEFAULTS };
  const volume = Number(s.getItem(KEY_VOLUME));
  return {
    enabled: flag(s, KEY_ENABLED, DEFAULTS.enabled),
    volume:
      s.getItem(KEY_VOLUME) === null || !Number.isFinite(volume)
        ? DEFAULTS.volume
        : clamp01(volume),
    vibrate: flag(s, KEY_VIBRATE, DEFAULTS.vibrate),
    clicks: flag(s, KEY_CLICKS, DEFAULTS.clicks),
    typing: flag(s, KEY_TYPING, DEFAULTS.typing),
  };
}

const listeners = new Set<() => void>();

export function setSoundSettings(patch: Partial<SoundSettings>): void {
  const s = storage();
  const next = { ...getSoundSettings(), ...patch };
  if (s) {
    s.setItem(KEY_ENABLED, next.enabled ? "1" : "0");
    s.setItem(KEY_VOLUME, String(clamp01(next.volume)));
    s.setItem(KEY_VIBRATE, next.vibrate ? "1" : "0");
    s.setItem(KEY_CLICKS, next.clicks ? "1" : "0");
    s.setItem(KEY_TYPING, next.typing ? "1" : "0");
  }
  listeners.forEach((l) => l());
}

/** للـ useSyncExternalStore في كارت الإعدادات */
export function subscribeSoundSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function clamp01(n: number): number {
  return Math.min(1, Math.max(0, n));
}

// ---------------------------------------------------------------- الصوت
let ctx: AudioContext | undefined;
let unlockInstalled = false;
let lastRealSoundAt = 0;

function getContext(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  if (!ctx) {
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    try {
      ctx = new Ctor();
    } catch {
      return undefined;
    }
  }
  return ctx;
}

/** يجهّز الصوت مع أول لمسة على الصفحة (المتصفح بيمنع الصوت قبلها). بتتنده مرة واحدة من __root. */
export function installSoundUnlock(): void {
  if (unlockInstalled || typeof window === "undefined") return;
  unlockInstalled = true;
  const unlock = () => {
    const c = getContext();
    if (c && c.state === "suspended") void c.resume();
  };
  for (const ev of ["pointerdown", "keydown", "touchstart"] as const) {
    window.addEventListener(ev, unlock, { capture: true, passive: true });
  }
  // ضغطة على أي زرار / أيقونة / قايمة / خانة كتابة → «طق» خفيفة (مرة واحدة هنا بدل كل صفحة)
  window.addEventListener("pointerdown", (e) => onPress(e.target), {
    capture: true,
    passive: true,
  });
  // كل حرف بيتكتب (كيبورد الكمبيوتر أو التليفون) → صوت أخف
  window.addEventListener("input", (e) => onType(e.target), { capture: true, passive: true });
}

const CLICKABLE =
  'button, a[href], select, summary, input, textarea, [contenteditable="true"], ' +
  '[role="button"], [role="tab"], [role="menuitem"], [role="menuitemradio"], [role="menuitemcheckbox"], ' +
  '[role="option"], [role="switch"], [role="checkbox"], [role="radio"], [role="combobox"], [role="link"]';

/** هل الضغطة دي على حاجة بتتداس؟ (مش على مساحة فاضية، ومش على زرار مقفول) */
export function isPressable(target: unknown): boolean {
  const el =
    target && typeof (target as Element).closest === "function"
      ? (target as Element).closest(CLICKABLE)
      : null;
  if (!el) return false;
  if ((el as HTMLButtonElement).disabled || el.getAttribute("aria-disabled") === "true")
    return false;
  if (el.closest("[data-no-click-sound]")) return false;
  return true;
}

function onPress(target: EventTarget | null): void {
  if (isPressable(target)) playSound("click");
}

const TYPING_INPUTS = new Set(["", "text", "search", "tel", "number", "email", "password", "url"]);
let lastKeyAt = 0;

function onType(target: EventTarget | null): void {
  const el = target as HTMLInputElement | null;
  const tag = el?.tagName;
  if (tag !== "INPUT" && tag !== "TEXTAREA" && !(el as HTMLElement | null)?.isContentEditable)
    return;
  if (tag === "INPUT" && !TYPING_INPUTS.has((el!.type || "").toLowerCase())) return;
  // قارئ الباركود بيكتب بسرعة جداً: صوت واحد كل 40 مللي ثانية بالكتير
  const now = Date.now();
  if (now - lastKeyAt < 40) return;
  lastKeyAt = now;
  playSound("key");
}

/** هل الصوت جاهز يشتغل دلوقتي من غير لمسة؟ */
export function isSoundReady(): boolean {
  return ctx?.state === "running";
}

function vibrate(name: SoundName, settings: SoundSettings): void {
  if (!settings.vibrate || !VIBRATION[name]) return;
  try {
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(VIBRATION[name]);
    }
  } catch {
    // بعض المتصفحات بترفض الاهتزاز قبل لمسة — مش مشكلة
  }
}

/** شغّل صوت + اهتزاز. عمرها ما بترمي غلطة: الصوت حاجة زيادة، مش لازم يوقّف الشغل. */
export function playSound(name: SoundName): void {
  const settings = getSoundSettings();
  // الضغطة والكتابة ليهم مفتاح لوحدهم (ممكن حد عاوز أصوات البيع من غير طقطقة)
  if (name === "click" && !settings.clicks) return;
  if (name === "key" && !settings.typing) return;
  // صوت حقيقي (بيع، غلطة…) بعد ضغطة على طول: الضغطة تسكت عشان مايبقوش فوق بعض
  if (name !== "click" && name !== "key") lastRealSoundAt = Date.now();
  else if (Date.now() - lastRealSoundAt < 150) return;
  vibrate(name, settings);
  if (!settings.enabled || settings.volume <= 0) return;
  const c = getContext();
  if (!c) return;
  try {
    if (c.state === "suspended") void c.resume();
    const master = c.createGain();
    master.gain.value = settings.volume * 0.5;
    master.connect(c.destination);
    const now = c.currentTime + 0.01;
    for (const t of TONES[name]) {
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = t.type ?? "sine";
      osc.frequency.setValueAtTime(t.freq, now + t.at);
      if (t.toFreq) osc.frequency.exponentialRampToValueAtTime(t.toFreq, now + t.at + t.dur);
      // هجمة سريعة ونزول ناعم عشان مايبقاش فيه «طقة»
      g.gain.setValueAtTime(0.0001, now + t.at);
      g.gain.exponentialRampToValueAtTime(t.gain ?? 0.6, now + t.at + 0.008);
      g.gain.exponentialRampToValueAtTime(0.0001, now + t.at + t.dur);
      osc.connect(g);
      g.connect(master);
      osc.start(now + t.at);
      osc.stop(now + t.at + t.dur + 0.02);
    }
  } catch {
    // تجاهل: الصوت مش أساسي
  }
}

/**
 * جرس متكرر (المطبخ): بيرن كل `everyMs` لحد ما حد يلمس الشاشة أو تنده `stop`.
 * بيرجّع دالة الإيقاف.
 */
export function startAlarm(name: SoundName = "bell", everyMs = 2500): () => void {
  if (typeof window === "undefined") return () => {};
  playSound(name);
  const timer = window.setInterval(() => playSound(name), everyMs);
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    window.clearInterval(timer);
    window.removeEventListener("pointerdown", stop, true);
    window.removeEventListener("keydown", stop, true);
  };
  window.addEventListener("pointerdown", stop, true);
  window.addEventListener("keydown", stop, true);
  return stop;
}
