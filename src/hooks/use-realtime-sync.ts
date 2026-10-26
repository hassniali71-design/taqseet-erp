import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";

import { supabase } from "@/lib/supabase-client";

/** بند 74 — "البيانات تتجدد لوحدها": اشتراك Supabase Realtime على جداول المحل (migration 0028
 * بيضيفها للـpublication). أي إضافة/تعديل من أي جهاز تاني (موظف بيحصّل من التابلت والمالك فاتح
 * الشاشة على الكمبيوتر) بيخلي الصفحات المفتوحة تعيد جلب الجدول ده لوحدها في أقل من ثانية — من غير
 * Refresh. اسم كل جدول هو نفسه مفتاح الـquery في useTenantList، فالـinvalidate بيوصل لكل صفحة
 * بتستخدمه. التغييرات بتتجمع (debounce) عشان دفعة تحصيل بتعدّل كذا قسط تعمل إعادة جلب واحدة.
 *
 * لو migration 0028 لسه متطبّقش، الاشتراك بينجح بس مفيش أحداث بتوصل — والنظام بيفضل شغال عادي
 * (كل عملية على نفس الجهاز بتحدّث الشاشة بنفسها، وأي صفحة بتتجدد لما تتفتح أو ترجع لها). */
const SYNCED_TABLES = [
  "customers",
  "guarantors",
  "products",
  "product_serials",
  "inventory_movements",
  "sales",
  "sale_returns",
  "exchange_transactions",
  "delivery_orders",
  "installment_plans",
  "installment_contracts",
  "installments",
  "installment_payments",
  "promises_to_pay",
  "restructure_events",
  "suppliers",
  "purchases",
  "supplier_payments",
  "treasury_accounts",
  "treasury_movements",
  "shifts",
  "expenses",
  "journal_entries",
  "partners",
  "partner_transactions",
] as const;

export function useRealtimeSync(tenantId: string | undefined) {
  const queryClient = useQueryClient();

  useEffect(() => {
    if (!tenantId) return;
    const pending = new Set<string>();
    let timer: ReturnType<typeof setTimeout> | null = null;
    const flush = () => {
      timer = null;
      for (const table of pending) {
        void queryClient.invalidateQueries({ queryKey: [table, tenantId] });
      }
      pending.clear();
    };

    let channel = supabase.channel(`tenant-sync-${tenantId}`);
    for (const table of SYNCED_TABLES) {
      channel = channel.on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `tenant_id=eq.${tenantId}` },
        () => {
          pending.add(table);
          if (!timer) timer = setTimeout(flush, 400);
        },
      );
    }
    channel.subscribe();

    return () => {
      if (timer) clearTimeout(timer);
      void supabase.removeChannel(channel);
    };
  }, [tenantId, queryClient]);
}
