import { supabase } from "@/lib/supabase-client";

/** Builds a single CSV (no new dependency needed for this) covering the tenant's core business
 * data — customers, products, cash sales, installment contracts — and triggers a browser
 * download. This is the practical, real interpretation of "download a copy of the project":
 * the app itself is a live, shared, multi-tenant SaaS deployment, not something a browser can
 * meaningfully "download" as a whole — what the owner actually wants and can safely take with
 * them is their own business data. Gated behind owner-password re-confirmation in the caller. */
export async function exportTenantDataCsv(tenantId: string, tenantName: string): Promise<void> {
  const [{ data: customers }, { data: products }, { data: sales }, { data: contracts }] =
    await Promise.all([
      supabase.from("customers").select("code, name, phone, status").eq("tenant_id", tenantId),
      supabase
        .from("products")
        .select("code, name, brand, model, cash_price, installment_price, active")
        .eq("tenant_id", tenantId),
      supabase
        .from("sales")
        .select("invoice_number, customer_name, total, status, created_at")
        .eq("tenant_id", tenantId),
      supabase
        .from("installment_contracts")
        .select("contract_number, customer_name, total_amount, status, created_at")
        .eq("tenant_id", tenantId),
    ]);

  function section(title: string, rows: Record<string, unknown>[] | null): string {
    if (!rows || rows.length === 0) return `${title}\n(لا يوجد بيانات)\n\n`;
    const headers = Object.keys(rows[0] as object);
    const escape = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [
      headers.join(","),
      ...rows.map((r) => headers.map((h) => escape(r[h])).join(",")),
    ];
    return `${title}\n${lines.join("\n")}\n\n`;
  }

  const csv =
    "﻿" + // BOM so Excel opens Arabic text correctly
    section("العملاء", customers) +
    section("الأجهزة", products) +
    section("المبيعات النقدية", sales) +
    section("عقود التقسيط", contracts);

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
