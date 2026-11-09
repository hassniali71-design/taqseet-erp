/* eslint-disable @typescript-eslint/no-explicit-any -- اختبار بمتصفح وهمي (منقول زي ما هو من دكانة/سفرة) */
/**
 * App sounds + vibration (src/lib/sounds.ts): settings per device, mute really mutes,
 * vibration follows its own switch, every sound builds valid tones, and the alarm stops on a touch.
 * Uses a fake AudioContext / navigator / localStorage — no real audio.
 * Run: bun run scripts/test-sounds.ts
 */
const checks: [string, boolean, unknown][] = [];

// ---- fake browser
const store = new Map<string, string>();
(globalThis as any).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => void store.set(k, String(v)),
  removeItem: (k: string) => void store.delete(k),
};
const vibrations: unknown[] = [];
Object.defineProperty(globalThis, "navigator", {
  value: { vibrate: (p: unknown) => (vibrations.push(p), true) },
  configurable: true,
});
let oscillators = 0;
let badRamp = false;
const param = () => ({
  value: 0,
  setValueAtTime() {},
  exponentialRampToValueAtTime(v: number) {
    if (!(v > 0)) badRamp = true; // exponential ramps to 0 throw in real browsers
  },
});
class FakeCtx {
  state = "suspended";
  currentTime = 0;
  destination = {};
  resume() {
    this.state = "running";
    return Promise.resolve();
  }
  createGain() {
    return { gain: param(), connect() {} };
  }
  createOscillator() {
    oscillators++;
    return { type: "sine", frequency: param(), connect() {}, start() {}, stop() {} };
  }
}
const winListeners = new Map<string, Set<(e?: unknown) => void>>();
(globalThis as any).window = {
  AudioContext: FakeCtx,
  addEventListener: (t: string, f: () => void) => {
    if (!winListeners.has(t)) winListeners.set(t, new Set());
    winListeners.get(t)!.add(f);
  },
  removeEventListener: (t: string, f: () => void) => winListeners.get(t)?.delete(f),
  setInterval: (f: () => void, ms: number) => setInterval(f, ms),
  clearInterval: (id: any) => clearInterval(id),
};
const fire = (t: string, target: unknown = null) =>
  [...(winListeners.get(t) ?? [])].forEach((f) => f({ target }));

const s = await import("../src/lib/sounds");

// ---- settings
checks.push([
  "defaults: on, 0.6, vibrate, clicks, typing",
  JSON.stringify(s.getSoundSettings()) ===
    '{"enabled":true,"volume":0.6,"vibrate":true,"clicks":true,"typing":true}',
  s.getSoundSettings(),
]);
let notified = 0;
const unsub = s.subscribeSoundSettings(() => notified++);
s.setSoundSettings({ volume: 5 });
checks.push([
  "volume clamped to 1",
  s.getSoundSettings().volume === 1,
  s.getSoundSettings().volume,
]);
checks.push(["listeners told", notified === 1, notified]);
unsub();
s.setSoundSettings({ volume: 0.6 });
checks.push(["unsubscribe works", notified === 1, notified]);
store.set("app_sound_volume", "garbage");
checks.push([
  "bad stored volume → default",
  s.getSoundSettings().volume === 0.6,
  s.getSoundSettings().volume,
]);
s.setSoundSettings({ volume: 0.6 });

// ---- unlock on first touch
s.installSoundUnlock();
s.playSound("tap"); // creates the context (suspended → resume)
fire("pointerdown");
checks.push(["ready after touch", s.isSoundReady(), null]);

// ---- every sound builds tones with valid ramps, and vibrates
const names: Parameters<typeof s.playSound>[0][] = [
  "tap",
  "success",
  "error",
  "done",
  "ding",
  "bell",
];
for (const n of names) {
  const before = oscillators;
  const vb = vibrations.length;
  s.playSound(n);
  checks.push([`${n}: plays tones`, oscillators > before, oscillators - before]);
  checks.push([`${n}: vibrates`, vibrations.length === vb + 1, vibrations.at(-1)]);
}
checks.push(["no exponential ramp to 0", !badRamp, null]);

// ---- mute: no tones, vibration still follows its own switch
s.setSoundSettings({ enabled: false });
let before = oscillators;
let vb = vibrations.length;
s.playSound("success");
checks.push(["muted → no tones", oscillators === before, oscillators - before]);
checks.push(["muted → still vibrates", vibrations.length === vb + 1, null]);
s.setSoundSettings({ enabled: true, vibrate: false });
vb = vibrations.length;
s.playSound("success");
checks.push(["vibrate off → no vibration", vibrations.length === vb, null]);
s.setSoundSettings({ volume: 0 });
before = oscillators;
s.playSound("ding");
checks.push(["volume 0 → no tones", oscillators === before, null]);
s.setSoundSettings({ volume: 0.6, vibrate: true });

// ---- click + typing sounds: own switches, quiet right after a real sound
const el = (tag: string, extra: Record<string, unknown> = {}) => {
  const node: any = {
    tagName: tag.toUpperCase(),
    getAttribute: (k: string) => extra[k] ?? null,
    ...extra,
  };
  node.closest = (sel: string) => {
    if (sel === "[data-no-click-sound]") return extra.noSound ? node : null;
    return (
      extra.inside ??
      (/(^|,\s*)button(,|$)/.test(sel) && tag === "button" ? node : tag === "input" ? node : null)
    );
  };
  return node;
};
checks.push(["button is pressable", s.isPressable(el("button")), null]);
checks.push(["disabled button is not", !s.isPressable(el("button", { disabled: true })), null]);
checks.push(["opt-out area is not", !s.isPressable(el("button", { noSound: true })), null]);
checks.push(["plain text is not", !s.isPressable(el("p")), null]);
checks.push(["nothing is not", !s.isPressable(null), null]);

await new Promise((r) => setTimeout(r, 200)); // past the «quiet after a real sound» window
before = oscillators;
fire("pointerdown"); // the window listener: target is undefined here → no click sound
s.playSound("click");
checks.push(["click plays", oscillators === before + 1, oscillators - before]);
s.setSoundSettings({ clicks: false });
before = oscillators;
s.playSound("click");
checks.push(["clicks off → silent", oscillators === before, null]);
s.setSoundSettings({ clicks: true, typing: false });
before = oscillators;
s.playSound("key");
checks.push(["typing off → silent", oscillators === before, null]);
s.setSoundSettings({ typing: true });
before = oscillators;
s.playSound("key");
checks.push(["typing on → plays", oscillators === before + 1, null]);
s.playSound("success");
before = oscillators;
s.playSound("click");
checks.push(["click right after a real sound is skipped", oscillators === before, null]);
vb = vibrations.length;
await new Promise((r) => setTimeout(r, 200));
s.playSound("key");
checks.push(["typing never vibrates", vibrations.length === vb, null]);

// ---- alarm repeats, stops on touch
before = oscillators;
const stop = s.startAlarm("bell", 50);
await new Promise((r) => setTimeout(r, 180));
const during = oscillators - before;
fire("pointerdown");
const afterStop = oscillators;
await new Promise((r) => setTimeout(r, 150));
checks.push(["alarm repeats", during >= 4 * 3, during]); // ≥3 rings × 4 tones
checks.push(["alarm stops on touch", oscillators === afterStop, oscillators - afterStop]);
stop(); // second stop is harmless

// ---- never throws without a browser audio API
(globalThis as any).window.AudioContext = undefined;
let threw = false;
try {
  s.playSound("error");
} catch {
  threw = true;
}
checks.push(["never throws", !threw, null]);

let failed = 0;
for (const [name, ok, got] of checks) {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(got));
}
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
