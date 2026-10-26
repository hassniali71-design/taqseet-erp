import { fetchAll, type PagedQuery } from "@/lib/fetch-all";
import { supabase } from "@/lib/supabase-client";

/** نسخة من بيانات المحل (CSV واحد يفتح على Excel) — زرار "تحميل نسخة من البيانات" في الإعدادات.
 *
 * بند 78: كانت بتجيب كل جدول بطلب واحد، فلو جدول عدّى حد Max Rows في Supabase (1000 افتراضيًا)
 * النسخة كانت بتطلع ناقصة **من غير أي تنبيه** — وده أخطر مكان ممكن يحصل فيه كده، لأن الملف ده
 * هو النسخة الاحتياطية العملية الوحيدة على خطة Supabase المجانية (مفيها backups). دلوقتي كل جدول
 * بيتجاب كامل (fetchAll)، والنسخة بقت بتشمل كل الجداول المالية المهمة مش 4 بس، وفي أولها ملخص
 * بعدد صفوف كل جدول عشان تتأكد إن النسخة كاملة (قارن بالعدد في Supabase). */
const SECTIONS: Array<{ title: string; table: string; columns: string }> = [
  { title: "العملاء", table: "customers", columns: "*" },
  { title: "الضامنون", table: "guarantors", columns: "*" },
  { title: "الأجهزة", table: "products", columns: "*" },
  { title: "السيريالات", table: "product_serials", columns: "*" },
  { title: "حركات المخزون", table: "inventory_movements", columns: "*" },
  { title: "المبيعات النقدية", table: "sales", columns: "*" },
  { title: "المرتجعات", table: "sale_returns", columns: "*" },
  { title: "خطط التقسيط", table: "installment_plans", columns: "*" },
  { title: "عقود التقسيط", table: "installment_contracts", columns: "*" },
  { title: "الأقساط", table: "installments", columns: "*" },
  { title: "إيصالات التحصيل", table: "installment_payments", columns: "*" },
  { title: "وعود السداد", table: "promises_to_pay", columns: "*" },
  { title: "الموردون", table: "suppliers", columns: "*" },
  { title: "المشتريات", table: "purchases", columns: "*" },
  { title: "مدفوعات الموردين", table: "supplier_payments", columns: "*" },
  { title: "الخزائن", table: "treasury_accounts", columns: "*" },
  { title: "حركات الخزينة", table: "treasury_movements", columns: "*" },
  { title: "المصروفات", table: "expenses", columns: "*" },
  { title: "القيود المحاسبية", table: "journal_entries", columns: "*" },
  { title: "الشركاء", table: "partners", columns: "*" },
  { title: "حركات الشركاء", table: "partner_transactions", columns: "*" },
];

export async function exportTenantDataCsv(tenantId: string, tenantName: string): Promise<void> {
  const results = await Promise.all(
    SECTIONS.map(async (section) => {
      const { data, error } = await fetchAll<Record<string, unknown>>(
        supabase
          .from(section.table)
          .select(section.columns, { count: "exact" })
          .eq("tenant_id", tenantId) as unknown as PagedQuery<Record<string, unknown>>,
      );
      if (error) throw new Error(`تعذّر تجهيز "${section.title}": ${error.message}`);
      return { ...section, rows: data };
    }),
  );

  const escape = (v: unknown) => {
    const text = v !== null && typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
    return `"${text.replace(/"/g, '""')}"`;
  };

  function section(title: string, rows: Record<string, unknown>[]): string {
    if (rows.length === 0) return `${title}\n(لا يوجد بيانات)\n\n`;
    const headers = Object.keys(rows[0] as object);
    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ];
    return `${title} (${rows.length} صف)\n${lines.join("\n")}\n\n`;
  }

  const summary = [
    `نسخة بيانات: ${tenantName}`,
    `تاريخ التصدير: ${new Date().toLocaleString("ar-EG")}`,
    "الجدول,عدد الصفوف",
    ...results.map((r) => `${escape(r.title)},${r.rows.length}`),
    "",
    "",
  ].join("\n");

  const csv =
    "﻿" + // BOM so Excel opens Arabic text correctly
    summary +
    results.map((r) => section(r.title, r.rows)).join("");

  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `${tenantName || "بيانات-المحل"}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
