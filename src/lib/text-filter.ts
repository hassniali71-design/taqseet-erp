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
function normalizeArabic(text: string) {
  return text
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي");
}
