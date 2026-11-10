/** فلترة نصية محلية بسيطة لجداول السجل/التاريخ (حركات خزينة، سجل تدقيق، قيود محاسبية...) —
 * فلترة في المتصفح على الصفوف المجلوبة أصلًا، مش استعلام سيرفر جديد (نفس فلسفة SearchPicker
 * لكن لفلترة جدول قائم بدل اختيار من قائمة). يطابق لو أي حقل من الحقول المُمرَّرة يحتوي على
 * نص البحث، بدون حساسية لحالة الأحرف. سترينج فاضي = يطابق كل شيء. */
export function matchesSearch(query: string, ...fields: Array<string | number | null | undefined>) {
  const q = normalizeArabic(query.trim().toLowerCase());
  if (!q) return true;
  return fields.some(
    (f) => f !== null && f !== undefined && normalizeArabic(String(f).toLowerCase()).includes(q),
  );
}

/** توحيد الحروف اللي بتتكتب بأكتر من شكل في الأسماء المصرية — "حسونه" تلاقي "حسونة"،
 * "احمد" تلاقي "أحمد"، "علي" تلاقي "على" — وشيل التشكيل والتطويل. */
export function normalizeArabic(text: string) {
  return text
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}

/** بند 86 — أسماء قريبة من اسم صنف جديد (عشان منع التكرار): نفس الاسم بعد التوحيد، أو واحد جوه
 * التاني، أو نفس الكلمات بترتيب مختلف. */
export function similarNames(name: string, existing: string[], limit = 3): string[] {
  const words = (s: string) =>
    normalizeArabic(s.trim().toLowerCase())
      .split(/[\s\-—–_،,]+/)
      .filter((w) => w.length > 1);
  const target = words(name);
  if (target.length === 0) return [];
  const joined = target.join(" ");
  const out: string[] = [];
  for (const other of existing) {
    const ow = words(other);
    const oj = ow.join(" ");
    const shared = target.filter((w) => ow.includes(w)).length;
    if (
      oj === joined ||
      (joined.length >= 4 && (oj.includes(joined) || joined.includes(oj))) ||
      (target.length >= 2 && shared >= Math.min(target.length, ow.length))
    ) {
      out.push(other);
      if (out.length >= limit) break;
    }
  }
  return out;
}
