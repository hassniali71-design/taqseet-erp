import { createClient } from "@supabase/supabase-js";

/** Single browser-side Supabase client — anon key only, never the service role key. Safe to
 * ship to the client bundle: Row Level Security (supabase/migrations/0001_foundation.sql)
 * is what actually protects tenant data, not secrecy of this key. Used first by
 * `signIn`/`signOut` in data-store.ts (real Supabase Auth); other data-store.ts functions
 * still read/write localStorage and will be migrated in later, separate steps. */
const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const anonKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] as string | undefined;

if (!url || !anonKey) {
  console.warn(
    "VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY غير مضبوطين في .env — تسجيل الدخول الحقيقي (Supabase Auth) لن يعمل حتى تُضافا.",
  );
}

export const supabase = createClient(
  url || "https://placeholder.supabase.co",
  anonKey || "placeholder",
);

/** The access token every security-sensitive `createServerFn` call must forward as
 * `accessToken` so the server can verify the caller's real identity (`resolveServerCaller` in
 * supabase-admin.ts) instead of trusting whatever `tenantId`/`actorUserId` the request body
 * claims. Throws the same "no active session" message `useRequireSession` already redirects on,
 * since a missing token here means the same thing. */
export async function getAccessToken(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("لا توجد جلسة نشطة — سجّل دخول تاني");
  return token;
}
