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
