/**
 * POST /push/dispatch — القاعدة (pg_net) بتنده هنا لما يحصل حدث يستاهل إشعار (بيع، أوردر جديد…).
 * نفس الملف في دكانة وسفرة. بيتنده من src/server.ts قبل تحميل البرنامج (زي /health).
 *
 * الطلب: هيدر x-push-secret (كلمة سر بين القاعدة والموقع) + JSON:
 *   { subs: [{endpoint,p256dh,auth}], title, body?, url?, tag? }
 * القاعدة هي اللي بتختار التليفونات (هي عارفة مين في المحل ومين ليه الصفحة)، فالموقع مش محتاج
 * أي مفتاح للقاعدة. التليفونات اللي اتشالت بتترجع للقاعدة تتمسح (push_forget).
 *
 * أسرار الـ Worker: PUSH_SECRET، VAPID_PUBLIC_KEY، VAPID_PRIVATE_KEY. (VAPID_SUBJECT اختياري.)
 */
import { sendPush, type PushSubscriptionKeys, type VapidKeys } from "./webpush";

const MAX_SUBS = 200;

export function isPushDispatchRequest(request: Request): boolean {
  if (request.method !== "POST") return false;
  return new URL(request.url).pathname === "/push/dispatch";
}

function env(name: string): string | undefined {
  try {
    const v = process.env[name];
    return v && v.trim() ? v.trim() : undefined;
  } catch {
    return undefined;
  }
}

/** مقارنة بوقت ثابت (عشان محدش يخمّن كلمة السر حرف حرف من سرعة الرد) */
export function safeEqual(a: string, b: string): boolean {
  const x = new TextEncoder().encode(a);
  const y = new TextEncoder().encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}

function clip(v: unknown, max: number): string {
  return typeof v === "string" ? v.slice(0, max) : "";
}

export async function handlePushDispatch(
  request: Request,
  deps: { fetchImpl?: typeof fetch } = {},
): Promise<Response> {
  const secret = env("PUSH_SECRET");
  const publicKey = env("VAPID_PUBLIC_KEY");
  const privateKey = env("VAPID_PRIVATE_KEY");
  if (!secret || !publicKey || !privateKey) return json(503, { error: "push not configured" });

  if (!safeEqual(request.headers.get("x-push-secret") ?? "", secret))
    return json(401, { error: "unauthorized" });

  // حسبة: نفس الفحص بالظبط، بأنواع صريحة بدل any (قواعد الـlint عندنا).
  let input: Record<string, unknown> | null;
  try {
    input = (await request.json()) as Record<string, unknown> | null;
  } catch {
    return json(400, { error: "bad json" });
  }
  const subs: PushSubscriptionKeys[] = (
    Array.isArray(input?.["subs"]) ? (input["subs"] as unknown[]) : []
  )
    .filter((v): v is PushSubscriptionKeys => {
      const s = v as Record<string, unknown> | null;
      return (
        !!s &&
        typeof s["endpoint"] === "string" &&
        typeof s["p256dh"] === "string" &&
        typeof s["auth"] === "string"
      );
    })
    .slice(0, MAX_SUBS);
  const title = clip(input?.["title"], 120);
  if (!title) return json(400, { error: "title required" });

  // url: صفحة جوه البرنامج بس (مش لينك برة)
  const rawUrl = clip(input?.["url"], 300);
  const url = rawUrl.startsWith("/") && !rawUrl.startsWith("//") ? rawUrl : "/";
  const message = {
    title,
    body: clip(input?.["body"], 300),
    url,
    tag: clip(input?.["tag"], 64) || undefined,
    ts: Date.now(),
  };

  const keys: VapidKeys = {
    publicKey,
    privateKey,
    subject: env("VAPID_SUBJECT") ?? `${new URL(request.url).origin}`,
  };

  const results = await Promise.all(
    subs.map((s) =>
      sendPush(s, message, keys, deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}).catch(() => ({
        endpoint: s.endpoint,
        status: 0,
        ok: false,
        gone: false,
      })),
    ),
  );
  const gone = results.filter((r) => r.gone).map((r) => r.endpoint);

  // التليفونات اللي اتشالت: القاعدة تمسحها (نفس كلمة السر، بالمفتاح العام)
  if (gone.length) {
    // حسبة: المفتاح العام اسمه VITE_SUPABASE_ANON_KEY (مش PUBLISHABLE زي دكانة/سفرة)
    const supaUrl = import.meta.env["VITE_SUPABASE_URL"] || process.env["SUPABASE_URL"];
    const supaKey = import.meta.env["VITE_SUPABASE_ANON_KEY"] || process.env["SUPABASE_ANON_KEY"];
    if (supaUrl && supaKey) {
      await (deps.fetchImpl ?? fetch)(`${supaUrl}/rest/v1/rpc/push_forget`, {
        method: "POST",
        headers: { apikey: supaKey, "content-type": "application/json" },
        body: JSON.stringify({ _secret: secret, _endpoints: gone }),
      }).catch(() => undefined);
    }
  }

  return json(200, {
    sent: results.filter((r) => r.ok).length,
    failed: results.filter((r) => !r.ok && !r.gone).length,
    gone: gone.length,
    statuses: results.map((r) => r.status),
  });
}
