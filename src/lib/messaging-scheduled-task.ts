import { defineTask } from "nitro/task";

import { sweepAllTenants } from "@/lib/twilio-server";

/** Registered as "messaging:daily-sweep" and scheduled via `scheduledTasks` in vite.config.ts —
 * Nitro's cloudflare-module preset turns that into a real Cloudflare Cron Trigger at build
 * time (no manual wrangler.json editing needed). Runs sweepAllTenants() cross-tenant, same
 * logic the manual "send today's reminders" button in collections.tsx calls per-tenant via
 * sendTenantReminderSweepServer (src/lib/twilio-server.ts). */
export default defineTask({
  meta: {
    name: "messaging:daily-sweep",
    description: "Daily due-soon/overdue SMS/WhatsApp reminder sweep across all tenants",
  },
  run: async () => {
    await sweepAllTenants();
    return { result: "ok" };
  },
});
