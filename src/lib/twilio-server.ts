import { createServerFn } from "@tanstack/react-start";

import { getSupabaseAdmin } from "@/lib/supabase-admin";

/** Server-only Twilio REST API caller — reads plain (non-VITE_-prefixed) env vars, so this
 * stays out of the client bundle by the same construction as supabase-admin.ts. No Twilio SDK
 * dependency (matches "no new libraries without clear need"): Twilio's REST API is a single
 * authenticated POST, trivially done with fetch + Basic Auth. Import only from inside a
 * createServerFn handler in this file or from the Nitro scheduled task
 * (src/lib/messaging-scheduled-task.ts) — never from a route component. */

interface TwilioCredentials {
  accountSid: string;
  authToken: string;
  smsFrom: string | undefined;
  whatsappFrom: string | undefined;
}

function getTwilioCredentials(): TwilioCredentials {
  const accountSid = process.env["TWILIO_ACCOUNT_SID"];
  const authToken = process.env["TWILIO_AUTH_TOKEN"];
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN غير مضبوطين على السيرفر");
  }
  return {
    accountSid,
    authToken,
    smsFrom: process.env["TWILIO_SMS_FROM"],
    whatsappFrom: process.env["TWILIO_WHATSAPP_FROM"], // e.g. "whatsapp:+14155238886" (sandbox)
  };
}

type Channel = "sms" | "whatsapp";

interface SendResult {
  ok: boolean;
  providerMessageSid?: string;
  errorMessage?: string;
}

/** Raw Twilio Messages API call. WhatsApp numbers carry a `whatsapp:` prefix on both From and
 * To per Twilio's convention (the sender number itself, e.g. TWILIO_WHATSAPP_FROM, is stored
 * WITH that prefix already — see .env.example). */
async function sendTwilioMessage(
  channel: Channel,
  toPhoneE164: string,
  body: string,
): Promise<SendResult> {
  const creds = getTwilioCredentials();
  const from = channel === "whatsapp" ? creds.whatsappFrom : creds.smsFrom;
  if (!from) {
    return {
      ok: false,
      errorMessage: `TWILIO_${channel === "whatsapp" ? "WHATSAPP" : "SMS"}_FROM غير مضبوط`,
    };
  }

  const to = channel === "whatsapp" ? `whatsapp:${toPhoneE164}` : toPhoneE164;
  const params = new URLSearchParams({ From: from, To: to, Body: body });

  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${creds.accountSid}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${creds.accountSid}:${creds.authToken}`)}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params,
    },
  );
  const json = (await res.json()) as { sid?: string; message?: string };
  if (!res.ok) return { ok: false, errorMessage: json.message ?? `Twilio error ${res.status}` };
  return { ok: true, ...(json.sid && { providerMessageSid: json.sid }) };
}

type EventType = "installment_due_soon" | "installment_overdue" | "user_credentials";
type Entity = "installment" | "user";

interface LogAndSendInput {
  tenantId: string;
  channel: Channel;
  eventType: EventType;
  entity: Entity;
  entityId: string;
  recipientPhone: string;
  body: string;
}

/** Checks message_logs for an existing successful send of this exact (tenant, event, entity)
 * today (UTC) before calling Twilio at all — avoids burning Twilio spend on a duplicate send,
 * in addition to the DB unique index (uq_message_logs_dedupe, migration 0018) that backstops
 * races between the cron sweep and a manual "send now" click firing close together. */
async function sendAndLogOnce(
  input: LogAndSendInput,
): Promise<{ skipped: boolean; result?: SendResult }> {
  const supabaseAdmin = getSupabaseAdmin();
  const todayUtc = new Date().toISOString().slice(0, 10);

  const { data: existing } = await supabaseAdmin
    .from("message_logs")
    .select("id")
    .eq("tenant_id", input.tenantId)
    .eq("event_type", input.eventType)
    .eq("entity_id", input.entityId)
    .eq("sent_on", todayUtc)
    .eq("status", "sent")
    .maybeSingle();
  if (existing) return { skipped: true };

  const result = await sendTwilioMessage(input.channel, input.recipientPhone, input.body);

  const { error: insertError } = await supabaseAdmin.from("message_logs").insert({
    tenant_id: input.tenantId,
    channel: input.channel,
    event_type: input.eventType,
    entity: input.entity,
    entity_id: input.entityId,
    recipient_phone: input.recipientPhone,
    status: result.ok ? "sent" : "failed",
    provider_message_sid: result.providerMessageSid ?? null,
    error_message: result.errorMessage ?? null,
  });
  // 23505 = unique_violation on uq_message_logs_dedupe — another concurrent call (cron +
  // manual button) already logged a successful send for this exact reminder today.
  if (insertError && insertError.code !== "23505") throw new Error(insertError.message);

  return { skipped: false, result };
}

/** Duplicated from data-store.ts's getDaysOverdue/getEffectiveInstallmentStatus rather than
 * imported — that file is a client-side Mock module (window/localStorage throughout) with no
 * place in a server-only bundle, same reasoning as SYSTEM_ROLE_NAMES in platform-server.ts. */
function daysUntilDueUtc(dueDateIso: string): number {
  const due = new Date(dueDateIso);
  due.setUTCHours(0, 0, 0, 0);
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

function isOverdue(dueDateIso: string, gracePeriodDays: number): boolean {
  const dueWithGrace = new Date(dueDateIso);
  dueWithGrace.setDate(dueWithGrace.getDate() + gracePeriodDays);
  return new Date() > dueWithGrace;
}

interface SweepResult {
  sent: number;
  skipped: number;
  failed: number;
}

/** Core sweep for ONE tenant — used by both the manual "send today's reminders" button
 * (collections.tsx, via sendTenantReminderSweepServer below) and the cron-driven cross-tenant
 * sweep (sweepAllTenants). Reads via the service-role client (this always runs server-side, so
 * there's no browser session for RLS to key off — same reasoning as fetchTenantSummary in
 * platform-server.ts). WhatsApp is preferred over SMS when both are enabled for a tenant. */
export async function runTenantReminderSweep(tenantId: string): Promise<SweepResult> {
  const supabaseAdmin = getSupabaseAdmin();
  const totals: SweepResult = { sent: 0, skipped: 0, failed: 0 };

  const { data: settings } = await supabaseAdmin
    .from("tenant_settings")
    .select("sms_notifications_enabled, whatsapp_notifications_enabled, grace_period_days")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  if (
    !settings ||
    (!settings["sms_notifications_enabled"] && !settings["whatsapp_notifications_enabled"])
  ) {
    return totals;
  }
  const channel: Channel = settings["whatsapp_notifications_enabled"] ? "whatsapp" : "sms";
  const gracePeriodDays = (settings["grace_period_days"] as number | null) ?? 0;

  const { data: contracts } = await supabaseAdmin
    .from("installment_contracts")
    .select("id, contract_number, customer_id")
    .eq("tenant_id", tenantId)
    .in("status", ["active", "partially_paid", "overdue"]);
  if (!contracts || contracts.length === 0) return totals;
  const contractById = new Map(contracts.map((c) => [c["id"] as string, c]));

  const { data: installments } = await supabaseAdmin
    .from("installments")
    .select("id, contract_id, due_date, amount, paid_amount, status")
    .eq("tenant_id", tenantId)
    .in(
      "contract_id",
      contracts.map((c) => c["id"] as string),
    )
    .not("status", "in", "(paid,waived,rescheduled)");
  if (!installments || installments.length === 0) return totals;

  const customerIds = [...new Set(contracts.map((c) => c["customer_id"] as string))];
  const { data: customers } = await supabaseAdmin
    .from("customers")
    .select("id, phone, alt_phone")
    .eq("tenant_id", tenantId)
    .in("id", customerIds);
  const phoneByCustomerId = new Map(
    (customers ?? []).map((c) => [
      c["id"] as string,
      (c["phone"] as string | null) || (c["alt_phone"] as string | null) || null,
    ]),
  );

  for (const installment of installments) {
    const contract = contractById.get(installment["contract_id"] as string);
    if (!contract) continue;
    const phone = phoneByCustomerId.get(contract["customer_id"] as string);
    if (!phone) continue;

    const dueDate = installment["due_date"] as string;
    const outstanding = (installment["amount"] as number) - (installment["paid_amount"] as number);
    const daysUntilDue = daysUntilDueUtc(dueDate);
    const overdue = isOverdue(dueDate, gracePeriodDays);

    let eventType: EventType | null = null;
    let body: string | null = null;
    if (overdue) {
      eventType = "installment_overdue";
      body = `تنبيه: عندك قسط متأخر على عقد ${contract["contract_number"]} بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م — برجاء السداد في أقرب وقت.`;
    } else if (daysUntilDue >= 0 && daysUntilDue <= 2) {
      eventType = "installment_due_soon";
      body = `تذكير: قسط عقد ${contract["contract_number"]} بمبلغ ${outstanding.toLocaleString("ar-EG")} ج.م مستحق بتاريخ ${dueDate.slice(0, 10)}.`;
    }
    if (!eventType || !body) continue;

    const { skipped, result } = await sendAndLogOnce({
      tenantId,
      channel,
      eventType,
      entity: "installment",
      entityId: installment["id"] as string,
      recipientPhone: phone,
      body,
    });
    if (skipped) totals.skipped++;
    else if (result?.ok) totals.sent++;
    else totals.failed++;
  }

  return totals;
}

/** Cron entry point — loops every tenant with either notification flag on. Cross-tenant by
 * design, same reasoning as fetchTenantStorageUsage's `tenantId`-omitted case in
 * platform-server.ts. Called from src/lib/messaging-scheduled-task.ts. */
export async function sweepAllTenants(): Promise<void> {
  const supabaseAdmin = getSupabaseAdmin();
  const { data: tenants } = await supabaseAdmin
    .from("tenant_settings")
    .select("tenant_id")
    .or("sms_notifications_enabled.eq.true,whatsapp_notifications_enabled.eq.true");
  for (const row of tenants ?? []) {
    await runTenantReminderSweep(row["tenant_id"] as string);
  }
}

/** collections.tsx's manual "send today's reminders" button — tenant-scoped, no Platform Owner
 * gating needed (same reasoning as createTenantUserWithAuth: caller's own tenant only). */
export const sendTenantReminderSweepServer = createServerFn({ method: "POST" })
  .validator((input: { tenantId: string }) => input)
  .handler(async ({ data }): Promise<SweepResult> => runTenantReminderSweep(data.tenantId));

/** users.tsx / platform.tsx's "send login credentials" button — entity is always 'user'
 * (works the same for a new employee or a new tenant owner's users.id row). tenantId is the
 * OWNING tenant of that users row (for a brand-new tenant, that's the new tenant's own id —
 * matches recordCrossTenantAudit's "log into the target tenant" convention). */
export const sendCredentialsServer = createServerFn({ method: "POST" })
  .validator(
    (input: {
      tenantId: string;
      userId: string;
      phone: string;
      email: string;
      password: string;
      channel: Channel;
    }) => input,
  )
  .handler(async ({ data }) => {
    const body = `بيانات الدخول لمنصة حسبة:\nالبريد: ${data.email}\nكلمة السر: ${data.password}`;
    return sendAndLogOnce({
      tenantId: data.tenantId,
      channel: data.channel,
      eventType: "user_credentials",
      entity: "user",
      entityId: data.userId,
      recipientPhone: data.phone,
      body,
    });
  });
