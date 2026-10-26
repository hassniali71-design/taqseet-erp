/** رقم آخر بند في docs/03-STATE.md — بيتحدّث مع كل بند جديد، وبيظهر في الشريط الجانبي مع وقت
 * البناء، عشان أي حد يتأكد من أي جهاز إن النسخة المنشورة هي الأخيرة. */
export const APP_VERSION = "بند 76";

declare const __APP_BUILD_TIME__: string;

export const APP_BUILD_TIME: string =
  typeof __APP_BUILD_TIME__ === "string" ? __APP_BUILD_TIME__ : "";
