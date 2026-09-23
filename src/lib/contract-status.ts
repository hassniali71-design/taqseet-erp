import type { InstallmentContract } from "@/types";

/** ترجمة عربية موحّدة لحالة عقد التقسيط — مستخدمة في كل مكان بيعرض `contract.status` الخام. */
export const CONTRACT_STATUS_LABEL: Record<InstallmentContract["status"], string> = {
  active: "نشط",
  partially_paid: "مدفوع جزئيًا",
  overdue: "متأخر",
  restructured: "أُعيد هيكلته",
  settled: "مسدد بالكامل",
  settled_early: "تسوية مبكرة",
  cancelled: "ملغى",
};
