/**
 * اختصارات الكيبورد للقوايم — نفس الملف في دكانة وسفرة.
 *
 * الترتيب بالأهمية: F1 لوحة التحكم، F2 البيع، وهكذا لحد F12.
 * F11 مش بنستخدمه: المتصفح حاجزه لملء الشاشة ومش بيسيبه للصفحة.
 * لما زراير F تخلص: Alt + رقم (Alt+1 … Alt+9). Alt+0 = شاشة «الاختصارات» نفسها.
 *
 * الاختصار ثابت للصفحة مهما كانت صلاحيات المستخدم (عشان كل الناس تحفظ نفس الزراير)؛
 * لو الصفحة مش مسموحة للحساب، الاختصار بيقول كده بدل ما يفتحها.
 */

/** المفاتيح بالترتيب اللي بتتوزع بيه على الصفحات */
export const SHORTCUT_KEYS = [
  "F1",
  "F2",
  "F3",
  "F4",
  "F5",
  "F6",
  "F7",
  "F8",
  "F9",
  "F10",
  "F12",
  "Alt+1",
  "Alt+2",
  "Alt+3",
  "Alt+4",
  "Alt+5",
  "Alt+6",
  "Alt+7",
  "Alt+8",
  "Alt+9",
] as const;

export const HELP_SHORTCUT = "Alt+0";

/** يوزّع المفاتيح على الصفحات بالترتيب. صفحة زيادة عن عدد المفاتيح مالهاش اختصار. */
export function assignShortcuts(urls: readonly string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const url of urls) {
    if (map.size >= SHORTCUT_KEYS.length) break;
    if (!map.has(url)) map.set(url, SHORTCUT_KEYS[map.size] as string);
  }
  return map;
}

type KeyLike = Pick<KeyboardEvent, "key" | "code" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey">;

/**
 * الزرار اللي اتداس بنفس شكل SHORTCUT_KEYS ("F3" أو "Alt+2")، أو null لو مش اختصار.
 * Alt + رقم بيتقري من مكان الزرار (code) عشان يشتغل والكيبورد عربي كمان.
 */
export function shortcutOf(e: KeyLike): string | null {
  if (e.ctrlKey || e.metaKey || e.shiftKey) return null;
  if (!e.altKey && /^F([1-9]|1[0-2])$/.test(e.key)) return e.key === "F11" ? null : e.key;
  if (e.altKey) {
    const m = /^(?:Digit|Numpad)([0-9])$/.exec(e.code);
    if (m) return `Alt+${m[1]}`;
  }
  return null;
}

/** بند 83: فتح شاشة «الاختصارات» من زرار في القايمة (الحدث بتسمعه KeyboardShortcuts). */
export const SHORTCUTS_OPEN_EVENT = "open-keyboard-shortcuts";
export function openShortcutsHelp(): void {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(SHORTCUTS_OPEN_EVENT));
}
