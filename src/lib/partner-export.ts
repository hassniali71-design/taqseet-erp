import type { Partner, PartnerTransaction } from "@/types";

/** كشف حساب شريك — CSV بصيغة Excel-friendly (BOM + فواصل)، نفس نمط exportTenantDataCsv في
 * export-data.ts بالظبط (مفيش داعي لمكتبة xlsx جديدة لسيناريو بسيط زي ده). يتحمّل على جهاز
 * الأونر جاهز يتبعت للشريك (واتساب/إيميل) كـ"كشف حساب" مفهوم. */
export function exportPartnerStatementCsv(
  partner: Partner,
  summary: {
    totalFunded: number;
    totalAllocated: number;
    availableFunding: number;
    totalProfit: number;
    balance: number;
    dealCount: number;
  },
  deals: Array<{
    date: string;
    productName: string;
    customerName: string;
    reference: string;
    dealValue: number | undefined;
    splitPct: number | null | undefined;
    costShare: number;
    profitSharePct: number | null | undefined;
    profit: number;
  }>,
  transactions: PartnerTransaction[],
): void {
  const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;

  const header = [
    `كشف حساب شريك — ${partner.name} (${partner.code})`,
    `تاريخ الإصدار: ${new Date().toLocaleDateString("ar-EG")}`,
    "",
  ].join("\n");

  const summarySection = [
    "الملخص",
    "البند,القيمة",
    `إجمالي التمويل,${summary.totalFunded}`,
    `مخصص لصفقات (اتخصم منه),${summary.totalAllocated}`,
    `متاح غير مخصص بعد,${summary.availableFunding}`,
    `إجمالي الأرباح,${summary.totalProfit}`,
    `الرصيد الحالي,${summary.balance}`,
    `عدد الصفقات,${summary.dealCount}`,
    "",
    "",
  ].join("\n");

  const dealsHeader = [
    "الصفقات",
    "التاريخ,الجهاز,العميل,المرجع,قيمة الصفقة,نصيبه من الصفقة %,تكلفته (اتخصم منه),نسبة ربحه %,ربحه",
  ].join("\n");
  const dealsRows = deals
    .map((d) =>
      [
        escape(d.date),
        escape(d.productName),
        escape(d.customerName),
        escape(d.reference),
        d.dealValue ?? "",
        d.splitPct ?? "",
        d.costShare,
        d.profitSharePct ?? "",
        d.profit,
      ].join(","),
    )
    .join("\n");

  const ledgerHeader = ["", "", "سجل الحركة الكامل", "النوع,المبلغ,السبب/المرجع,التاريخ"].join(
    "\n",
  );
  const TYPE_LABEL: Record<string, string> = {
    funding: "تمويل",
    withdrawal: "سحب",
    sale_settlement: "تسوية صفقة",
    adjustment: "تسوية يدوية",
  };
  const ledgerRows = transactions
    .map((t) =>
      [
        escape(TYPE_LABEL[t.type] ?? t.type),
        t.amount,
        escape(t.reference ?? t.reason ?? ""),
        escape(new Date(t.created_at).toLocaleString("ar-EG")),
      ].join(","),
    )
    .join("\n");

  const csv =
    "﻿" + // BOM عشان إكسل يفتح العربي صح
    header +
    summarySection +
    dealsHeader +
    "\n" +
    dealsRows +
    "\n" +
    ledgerHeader +
    "\n" +
    ledgerRows;

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `كشف-حساب-${partner.name}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
