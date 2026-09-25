import { createClient } from "@supabase/supabase-js";

/** Server-only Supabase client — service role key, bypasses Row Level Security entirely.
 * Import ONLY from inside a TanStack Start server function (`createServerFn`) handler in
 * src/lib/platform-server.ts, never from a route component or any module reachable from the
 * client bundle: this key must never reach the browser (unlike the anon key in
 * src/lib/supabase-client.ts, which is safe to ship). Reads plain `SUPABASE_URL`/
 * `SUPABASE_SERVICE_ROLE_KEY` (no `VITE_` prefix — Vite only exposes VITE_-prefixed vars to
 * client code, so the absence of that prefix is what keeps this server-only by construction). */
export function getSupabaseAdmin() {
  const url = process.env["SUPABASE_URL"];
  const serviceRoleKey = process.env["SUPABASE_SERVICE_ROLE_KEY"];
  if (!url || !serviceRoleKey) {
    throw new Error("SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY غير مضبوطين على السيرفر");
  }
  return createClient(url, serviceRoleKey);
}

export interface ServerCaller {
  userId: string;
  tenantId: string;
  isPlatformOwner: boolean;
}

/** Every server function that uses `getSupabaseAdmin()` bypasses RLS entirely by design — the
 * *only* thing standing between "signed-in user" and "can read/write any tenant's data" is
 * whatever this function checks. Before this existed, several of those functions (tenant data
 * reset, employee provisioning, platform tenant management) trusted a `tenantId`/`actorUserId`
 * value the CLIENT supplied in the request body — a real cross-tenant bypass, since nothing
 * stopped a request from claiming to be any tenant/user it liked.
 *
 * This cryptographically verifies the caller's Supabase Auth access token (the same real
 * session `supabase.auth.getSession()` already holds client-side — no new login flow, just
 * forwarding the existing token) via `auth.getUser()`, then looks up that VERIFIED auth user's
 * own `users` row to get their real `tenant_id`/`is_platform_owner` — never the client-supplied
 * ones. A caller who claims to be someone else, or claims a role they don't have, is rejected
 * before any admin-client query runs. */
export async function resolveServerCaller(accessToken: string | undefined): Promise<ServerCaller> {
  if (!accessToken) throw new Error("لا توجد جلسة نشطة — سجّل دخول تاني");
  const admin = getSupabaseAdmin();
  const { data: authData, error: authError } = await admin.auth.getUser(accessToken);
  if (authError || !authData.user) throw new Error("جلسة غير صالحة — سجّل دخول تاني");
  const { data: userRow, error: userError } = await admin
    .from("users")
    .select("id, tenant_id, is_platform_owner")
    .eq("auth_user_id", authData.user.id)
    .single();
  if (userError || !userRow) throw new Error("المستخدم غير موجود");
  return {
    userId: userRow["id"] as string,
    tenantId: userRow["tenant_id"] as string,
    isPlatformOwner: !!userRow["is_platform_owner"],
  };
}
