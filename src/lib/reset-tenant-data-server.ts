import { createServerFn } from "@tanstack/react-start";

import { getSupabaseAdmin, resolveServerCaller } from "@/lib/supabase-admin";

/** Wipes every business-data row for one tenant — customers, products, sales, installment
 * contracts, purchases, treasury, everything — while leaving the tenant's own identity intact
 * (the `tenants` row itself, `tenant_settings`, `users`, `roles`/`permissions`/`user_roles`).
 * Meant for exactly one moment: after a demo dataset has proven the system to a client,
 * clearing it so the tenant starts at zero, ready for real data entry — not a general
 * "delete some rows" utility.
 *
 * Several of these tables (installment_payments, restructure_events, purchases,
 * supplier_payments, treasury_movements, expenses, journal_entries, sale_returns,
 * exchange_transactions) are select+insert-only under RLS by design (§11 — no hard delete for
 * an ordinary signed-in user, ever). This one deliberate exception needs the service role to
 * bypass RLS entirely, which is exactly why it lives in a server function instead of a client
 * mutation — the UI gates reaching it at all behind owner-password re-confirmation AND a typed
 * "احذف" confirmation, on top of this being unreachable from the browser without going through
 * this narrow endpoint.
 *
 * Order matters: child rows are deleted before the parents they reference (several FKs are
 * `on delete restrict`, not `cascade`), and `audit_logs` is cleared last so the one audit line
 * this function itself writes afterward becomes the tenant's fresh first entry. */
const TABLES_IN_DELETE_ORDER = [
  "installment_payments",
  "promises_to_pay",
  "restructure_events",
  "installments",
  "installment_contracts",
  "sale_returns",
  "exchange_transactions",
  "delivery_orders",
  // partner_transactions.partner_id -> partners(id) on delete restrict, فلازم تتحذف الأول.
  "partner_transactions",
  "partners",
  "sales",
  "guarantors",
  "customers",
  "product_serials",
  "inventory_movements",
  "products",
  "product_categories",
  "product_brands",
  "purchases",
  "supplier_payments",
  "suppliers",
  "treasury_movements",
  "shifts",
  "expenses",
  "treasury_accounts",
  "journal_entries",
  "installment_plans",
  "message_logs",
  // عدّادات توليد الأكواد الذرية (migration 0022/0024) — لازم تتصفّر كمان، وإلا أول عميل/منتج
  // جديد بعد التصفير هياخد رقم كود مكمّل من قبل التصفير، مش يبدأ من 0001 زي المفروض.
  "tenant_code_counters",
  "audit_logs",
] as const;

export const resetTenantDataServer = createServerFn({ method: "POST" })
  .validator((input: { tenantId: string; accessToken: string }) => input)
  .handler(async ({ data }) => {
    // The caller's real tenant is derived from their verified session, never trusted from the
    // request body — without this, any signed-in user of any tenant could pass another
    // tenant's id and wipe its entire business data. Only that tenant's own signed-in user may
    // reset it (the UI already gates reaching this behind owner-password re-confirmation).
    const caller = await resolveServerCaller(data.accessToken);
    if (caller.tenantId !== data.tenantId) {
      throw new Error("غير مسموح بتصفير بيانات محل تاني");
    }
    const supabaseAdmin = getSupabaseAdmin();
    for (const table of TABLES_IN_DELETE_ORDER) {
      const { error } = await supabaseAdmin.from(table).delete().eq("tenant_id", data.tenantId);
      if (error) throw new Error(`فشل حذف بيانات "${table}": ${error.message}`);
    }
    await supabaseAdmin.from("audit_logs").insert({
      tenant_id: data.tenantId,
      user_id: caller.userId,
      action: "tenant_data.reset",
      entity: "tenants",
      entity_id: data.tenantId,
      reason: "تصفير بيانات العرض التجريبي قبل بدء الإدخال الحقيقي",
    });
  });
