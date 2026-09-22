// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - TanStack devtools (dev-only, first), tanstackStart, viteReact, tailwindcss, tsConfigPaths,
//     nitro (build-only using cloudflare as a default target), VITE_* env injection, @ path alias,
//     React/TanStack dedupe, error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import type { NitroConfig } from "nitro/types";
import { fileURLToPath } from "node:url";

// The wrapper's own `nitro` option type is deliberately narrow (preset/output/cloudflare only —
// see its own doc comment in node_modules/@lovable.dev/vite-tanstack-config/dist/index.d.ts),
// but its runtime does an unfiltered spread of the whole object into `nitro()` from `nitro/vite`
// (verified in dist/index.js: `{ defaultPreset: "cloudflare-module", ...userNitroOpts }`) — so
// Nitro's own config keys reach it untouched. Declaring this as a separately-typed const (not
// an inline object literal under `nitro:`) sidesteps the wrapper's narrow TS surface without an
// unsafe cast: TypeScript's excess-property check only fires on fresh object literals, not on
// an already-typed variable being assigned to a structurally-compatible (if narrower) target.
//
// This wires Nitro's "Tasks" feature (nitro.build/config#tasks) for the daily SMS/WhatsApp
// reminder sweep (src/lib/messaging-scheduled-task.ts, src/lib/twilio-server.ts). The
// cloudflare-module preset has native Cron Trigger support: it writes `triggers.crons` into the
// generated wrangler.json automatically at build time — confirm this after a real `bun run
// build` (`grep crons .output/server/wrangler.json`) and, after deploying, confirm the trigger
// actually fired via Cloudflare Dashboard → Workers → Triggers (not verifiable from this repo).
// A relative path here ("./src/lib/...") failed to resolve — Rolldown reported "Rolldown
// failed to resolve import ... from #nitro/virtual/tasks", meaning the virtual tasks module
// isn't relative to the project root the way a plain nitro.config.ts's rootDir would be inside
// this Vite-plugin-driven build. An absolute path built from this file's own location resolves
// unambiguously regardless of that internal root.
const messagingTaskHandler = fileURLToPath(
  new URL("./src/lib/messaging-scheduled-task.ts", import.meta.url),
);

const nitroConfig: Partial<NitroConfig> = {
  experimental: { tasks: true },
  tasks: { "messaging:daily-sweep": { handler: messagingTaskHandler } },
  scheduledTasks: {
    // 06:00 UTC ≈ 08:00 Cairo (UTC+2 standard time). Workers Cron Triggers always evaluate in
    // UTC — re-verify this offset if/when Egypt's DST rules change.
    "0 6 * * *": ["messaging:daily-sweep"],
  },
};

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
  nitro: nitroConfig,
  // This container has no IPv6 stack at all, so the plugin's sandbox-detected `::` (dual-stack
  // any) bind fails with EAFNOSUPPORT. Force an IPv4-only host for local dev here; harmless
  // elsewhere since it's just an explicit bind address, not a duplicate plugin.
  vite: {
    server: { host: "0.0.0.0" },
  },
});
