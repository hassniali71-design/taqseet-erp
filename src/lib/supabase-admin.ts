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
