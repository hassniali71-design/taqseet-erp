// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// Nitro defaults compatibility_date to "today" computed from THIS MACHINE'S LOCAL CLOCK
// (not UTC) — see node_modules/nitro/dist/_libs/compatx.mjs. If the build machine's local
// date rolls to the next day before UTC does, `wrangler deploy` rejects it as "in the
// future" (code 10021). A plain `.env` entry never reaches here: nothing in this pipeline
// loads `.env` into `process.env` for Node-side config (only VITE_*-prefixed client defines
// are injected). Pin a fixed, already-past date instead of trusting the moving default —
// bump it deliberately when adopting newer Workers runtime features, not automatically.
if (!process.env["NITRO_COMPATIBILITY_DATE"]) {
  process.env["NITRO_COMPATIBILITY_DATE"] = "2026-09-15";
}

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  // This container has no IPv6 stack at all, so the plugin's sandbox-detected `::` (dual-stack
  // any) bind fails with EAFNOSUPPORT. Force an IPv4-only host for local dev here; harmless
  // elsewhere since it's just an explicit bind address, not a duplicate plugin.
  vite: {
    server: { host: "0.0.0.0" },
  },
});
