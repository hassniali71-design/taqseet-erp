/**
 * Keyboard shortcuts (src/lib/shortcuts.ts): keys handed out in order, F11 skipped,
 * Alt+number read from the key's place (works on an Arabic keyboard), Ctrl/Shift ignored.
 * Run: bun run scripts/test-shortcuts.ts
 */
import { HELP_SHORTCUT, SHORTCUT_KEYS, assignShortcuts, shortcutOf } from "../src/lib/shortcuts";

const checks: [string, boolean, unknown][] = [];
const k = (
  key: string,
  code = "",
  mods: Partial<Record<"altKey" | "ctrlKey" | "metaKey" | "shiftKey", boolean>> = {},
) =>
  shortcutOf({
    key,
    code,
    altKey: false,
    ctrlKey: false,
    metaKey: false,
    shiftKey: false,
    ...mods,
  });

const m = assignShortcuts(["/a", "/b", "/a", ...Array.from({ length: 30 }, (_, i) => `/p${i}`)]);
checks.push(["first page F1", m.get("/a") === "F1", m.get("/a")]);
checks.push(["second page F2", m.get("/b") === "F2", m.get("/b")]);
checks.push(["no F11 handed out", ![...m.values()].includes("F11"), null]);
checks.push(["12th key is Alt+1", SHORTCUT_KEYS[11] === "Alt+1", SHORTCUT_KEYS[11]]);
checks.push(["at most 20 shortcuts", m.size === SHORTCUT_KEYS.length && m.size === 20, m.size]);
checks.push(["keys unique", new Set(m.values()).size === m.size, null]);

checks.push(["F2", k("F2") === "F2", k("F2")]);
checks.push(["F12", k("F12") === "F12", k("F12")]);
checks.push(["F11 ignored", k("F11") === null, k("F11")]);
checks.push(["Ctrl+F5 ignored", k("F5", "", { ctrlKey: true }) === null, null]);
checks.push(["Shift+F3 ignored", k("F3", "", { shiftKey: true }) === null, null]);
checks.push(["Alt+3 English", k("3", "Digit3", { altKey: true }) === "Alt+3", null]);
checks.push(["Alt+3 Arabic keyboard", k("٣", "Digit3", { altKey: true }) === "Alt+3", null]);
checks.push(["Alt+numpad 4", k("4", "Numpad4", { altKey: true }) === "Alt+4", null]);
checks.push(["Alt+0 is help", k("0", "Digit0", { altKey: true }) === HELP_SHORTCUT, null]);
checks.push(["plain letter ignored", k("a", "KeyA") === null, null]);
checks.push(["plain digit ignored (typing numbers)", k("3", "Digit3") === null, null]);
checks.push(["Alt+F4 not ours", k("F4", "F4", { altKey: true }) === null, null]);

// every app's real order fits and starts with dashboard / sale
for (const [app, order] of [
  [
    "dukkana",
    [
      "/dashboard",
      "/pos",
      "/sales",
      "/returns",
      "/products",
      "/inventory",
      "/purchases",
      "/customers",
      "/suppliers",
      "/finance",
      "/expenses",
      "/reports",
      "/inquiry",
      "/categories",
      "/maintenance",
      "/assets",
      "/users",
      "/settings",
    ],
  ],
  [
    "sofra",
    [
      "/dashboard",
      "/pos",
      "/orders",
      "/kitchen",
      "/tables",
      "/shifts",
      "/menu",
      "/inventory",
      "/purchases",
      "/customers",
      "/expenses",
      "/reports",
      "/lookup",
      "/menu-categories",
      "/modifiers",
      "/suppliers",
      "/assets",
      "/users",
      "/settings",
    ],
  ],
] as const) {
  const a = assignShortcuts(order);
  checks.push([`${app}: every page has a key`, a.size === order.length, a.size]);
  checks.push([
    `${app}: F1 dashboard, F2 sale`,
    a.get("/dashboard") === "F1" && a.get("/pos") === "F2",
    null,
  ]);
}

let failed = 0;
for (const [name, ok, got] of checks) {
  if (!ok) failed++;
  console.log(ok ? "PASS" : "FAIL", name, ok ? "" : JSON.stringify(got));
}
console.log(failed ? `${failed} FAILED` : `all ${checks.length} passed`);
process.exit(failed ? 1 : 0);
