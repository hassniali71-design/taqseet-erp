import { useUsers } from "@/lib/supabase-queries";
import { canEditDelete, canOpenPage, isFullAccess, parsePermissions } from "@/lib/permissions";
import type { UserPermissions } from "@/types";

/** صلاحيات المستخدم الداخل دلوقتي (بند 87). لحد ما قايمة المستخدمين تتحمّل `loaded` = false؛ ولو ملف
 * 0036 متطبّقش العمود مش موجود = صلاحيات كاملة = السلوك القديم بالظبط. */
export function usePermissions(session: { tenant_id: string; user_id: string } | null | undefined) {
  const { data: users, isSuccess } = useUsers(session?.tenant_id);
  const me = users?.find((u) => u.id === session?.user_id);
  const perms: UserPermissions | null = me ? parsePermissions(me.permissions) : null;
  return {
    loaded: isSuccess && Boolean(me),
    perms,
    full: isFullAccess(perms),
    canOpen: (pathname: string) => canOpenPage(perms, pathname),
    canEditDelete: canEditDelete(perms),
  };
}
