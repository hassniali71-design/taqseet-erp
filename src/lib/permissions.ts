/** صلاحيات الموظفين (بند 87 — ملف 0036). المالك بيعلّم بعلامات صح على الصفحات اللي الموظف يفتحها،
 * وعلامة لـ«الحذف والتعديل». `null` = صلاحيات كاملة (المالك، وكل حساب قديم — فمفيش حد بيتأثر).
 *
 * المستخدمون والإعدادات للمالك بس دايمًا (قرار المالك). الإشعارات مفتوحة للكل. */
import type { UserPermissions } from "@/types";

export interface PagePermission {
  key: string;
  label: string;
  /** أول مسار للصفحة + أي صفحات تفاصيل تابعة ليها. */
  paths: string[];
  /** حاجة حساسة (فلوس/حسابات) — بتتعلّم بعلامة تحذير في شاشة الصلاحيات. */
  sensitive?: boolean;
}

export const PAGE_PERMISSIONS: PagePermission[] = [
  { key: "dashboard", label: "لوحة التحكم", paths: ["/dashboard"] },
  { key: "customers", label: "العملاء", paths: ["/customers"] },
  { key: "sales", label: "بيع كاش", paths: ["/sales/new", "/sales"] },
  { key: "installment", label: "بيع تقسيط", paths: ["/sales/new-installment"] },
  { key: "collections", label: "التحصيل", paths: ["/collections", "/contracts"] },
  { key: "products", label: "الأصناف والمخزون", paths: ["/products"] },
  { key: "stock_count", label: "جرد المخزون", paths: ["/stock-count"] },
  { key: "suppliers", label: "الموردون", paths: ["/suppliers"] },
  { key: "purchases", label: "شراء جديد", paths: ["/purchases"] },
  { key: "deliveries", label: "التوصيل", paths: ["/deliveries"] },
  { key: "exchanges", label: "استبدال", paths: ["/exchanges"] },
  { key: "warranty", label: "الضمان", paths: ["/warranty"] },
  { key: "expenses", label: "المصروفات", paths: ["/expenses"] },
  { key: "treasury", label: "الخزينة ورصيدها", paths: ["/treasury"], sensitive: true },
  { key: "reports", label: "التقارير", paths: ["/reports"], sensitive: true },
  { key: "accounting", label: "المحاسبة", paths: ["/accounting"], sensitive: true },
  { key: "partners", label: "الشركاء", paths: ["/partners"], sensitive: true },
  { key: "audit", label: "سجل العمليات", paths: ["/audit"], sensitive: true },
];

export const EMPTY_PERMISSIONS: UserPermissions = { pages: [], edit_delete: false };

const OWNER_ONLY_PATHS = ["/users", "/settings"];
const ALWAYS_OPEN_PATHS = ["/notifications"];

const matches = (pathname: string, base: string) =>
  pathname === base || pathname.startsWith(`${base}/`);

/** مفتاح الصفحة لمسار معيّن (أطول تطابق يكسب: /sales/new-installment قبل /sales). */
export function pageKeyForPath(pathname: string): string | null {
  let best: { key: string; len: number } | null = null;
  for (const p of PAGE_PERMISSIONS) {
    for (const base of p.paths) {
      if (matches(pathname, base) && (!best || base.length > best.len)) {
        best = { key: p.key, len: base.length };
      }
    }
  }
  return best?.key ?? null;
}

export function isFullAccess(perms: UserPermissions | null | undefined): perms is null | undefined {
  return perms === null || perms === undefined;
}

export function canOpenPage(perms: UserPermissions | null | undefined, pathname: string): boolean {
  if (isFullAccess(perms)) return true;
  if (ALWAYS_OPEN_PATHS.some((b) => matches(pathname, b))) return true;
  if (OWNER_ONLY_PATHS.some((b) => matches(pathname, b))) return false;
  const key = pageKeyForPath(pathname);
  // صفحة مش في القايمة (صفحة جديدة لسه محدش علّم عليها) = للمالك بس لحد ما تتضاف.
  return key !== null && perms.pages.includes(key);
}

export function canEditDelete(perms: UserPermissions | null | undefined): boolean {
  return isFullAccess(perms) || perms.edit_delete === true;
}

/** أول صفحة الموظف يقدر يفتحها (بعد الدخول أو لو فتح صفحة مش مسموحة). */
export function firstAllowedPath(perms: UserPermissions | null | undefined): string {
  if (isFullAccess(perms)) return "/dashboard";
  const page = PAGE_PERMISSIONS.find((p) => perms.pages.includes(p.key));
  return page?.paths[0] ?? "/notifications";
}

/** قراية آمنة من القاعدة — أي شكل غلط = موظف من غير صفحات (مش صلاحيات كاملة). */
export function parsePermissions(raw: unknown): UserPermissions | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== "object") return { pages: [], edit_delete: false };
  const r = raw as { pages?: unknown; edit_delete?: unknown };
  return {
    pages: Array.isArray(r.pages) ? r.pages.filter((p): p is string => typeof p === "string") : [],
    edit_delete: r.edit_delete === true,
  };
}
