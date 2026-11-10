import { useCurrentTenantSettings } from "@/lib/supabase-queries";
import { tenantFeatures } from "@/lib/tenant-features";
import type { TenantFeatures } from "@/types";

/** مفاتيح مميزات المحل الحالي (بند 85). لحد ما الإعدادات تتحمّل، أو لو ملف 0034 متطبّقش = السلوك
 * القديم بالظبط، فمفيش شاشة بتتغيّر عند العميل القديم ولا لحظة. */
export function useTenantFeatures(tenantId: string | undefined): TenantFeatures {
  const { data } = useCurrentTenantSettings(tenantId);
  return tenantFeatures(data);
}
