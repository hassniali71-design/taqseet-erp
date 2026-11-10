import type { TenantFeatures, TenantSettings } from "@/types";

/** مفاتيح مميزات المحل (بند 85). أي مفتاح مش موجود (القاعدة لسه من غير ملف 0034، أو الإعدادات لسه
 * بتتحمّل) = القيمة الافتراضية = السلوك القديم بالظبط — عشان العميل القديم ميشوفش أي فرق. */
export const DEFAULT_TENANT_FEATURES: TenantFeatures = {
  goods_enabled: false,
  partners_mode: "per_deal",
  customer_accounts_enabled: false,
  deferred_cash_enabled: false,
};

export function tenantFeatures(
  settings: Partial<TenantSettings> | null | undefined,
): TenantFeatures {
  return {
    goods_enabled: settings?.goods_enabled === true,
    partners_mode: settings?.partners_mode === "capital_pool" ? "capital_pool" : "per_deal",
    customer_accounts_enabled: settings?.customer_accounts_enabled === true,
    deferred_cash_enabled: settings?.deferred_cash_enabled === true,
  };
}
